import { Router } from 'express';
import { ethers } from 'ethers';
import prisma from '../db.js';
import { adminAuth } from '../middleware/auth.js';
import config from '../config.js';
import logger from '../logger.js';
import { chainReady, forgeToken, arenaVault } from '../chain/index.js';
import { submitTx } from '../chain/tx.js';
import { totalSupply } from '../chain/token.js';
import { getTotalBurned } from '../chain/arena.js';
import { runBootstrapEmission } from '../jobs/bootstrap.js';

const router = Router();

// All admin routes require basic auth
router.use(adminAuth(config.admin.user, config.admin.pass));

// ─── Dashboard Stats ───────────────────────────────────────

router.get('/stats', async (req, res) => {
    const [wallets, puzzles, transactions] = await Promise.all([
        prisma.wallet.count(),
        prisma.puzzle.groupBy({
            by: ['status'],
            _count: true,
        }),
        prisma.transaction.aggregate({
            _count: true,
            _sum: { amount: true },
        }),
    ]);

    // On-chain stats (best effort)
    let onChainStats = null;
    if (chainReady) {
        try {
            const [supply, burned] = await Promise.all([
                totalSupply(),
                getTotalBurned(),
            ]);
            onChainStats = {
                totalSupply: supply.toString(),
                totalBurned: burned.toString(),
            };
        } catch { /* swallow */ }
    }

    res.json({
        wallets,
        puzzlesByStatus: Object.fromEntries(puzzles.map((p) => [p.status, p._count])),
        totalTransactions: transactions._count,
        totalVolume: transactions._sum.amount || 0,
        onChainStats,
    });
});

// ─── List All Puzzles (including answers) ──────────────────

router.get('/puzzles', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [puzzles, total] = await Promise.all([
        prisma.puzzle.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                smith: { select: { name: true } },
                solver: { select: { name: true } },
            },
        }),
        prisma.puzzle.count(),
    ]);

    res.json({ puzzles, total, page, limit, hasMore: skip + puzzles.length < total });
});

// ─── View Puzzle Detail with Answer Hash ───────────────────

router.get('/puzzles/:id', async (req, res) => {
    const puzzle = await prisma.puzzle.findUnique({
        where: { id: req.params.id },
        include: {
            smith: { select: { name: true, apiKey: false } },
            solver: { select: { name: true } },
            solveAttempts: true,
            transactions: true,
        },
    });

    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    res.json(puzzle);
});

// ─── List All Wallets ──────────────────────────────────────

router.get('/wallets', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [wallets, total] = await Promise.all([
        prisma.wallet.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            select: {
                id: true,
            name: true,
            address: true,
            xHandle: true,
            reputation: true,
            createdAt: true,
            // Never expose API keys, not even to admin
            },
        }),
        prisma.wallet.count(),
    ]);

    res.json({ wallets, total, page, limit, hasMore: skip + wallets.length < total });
});

// ─── Adjust Wallet Balance (dispute resolution) ────────────
// On-chain: positive amounts transfer from treasury to wallet.
// Negative amounts are not supported on-chain (tokens can't be force-withdrawn).

const MAX_ADMIN_ADJUSTMENT = 100000; // max single adjustment

router.post('/wallets/:id/adjust', async (req, res) => {
    const { amount, memo } = req.body;
    if (typeof amount !== 'number' || !memo) {
        return res.status(400).json({ error: 'Provide numeric amount and memo.' });
    }

    if (amount < 0) {
        return res.status(400).json({
            error: 'Negative adjustments not supported on-chain. Use contract admin functions for penalties.',
        });
    }

    if (amount > MAX_ADMIN_ADJUSTMENT) {
        return res.status(400).json({
            error: `Adjustment exceeds maximum of ${MAX_ADMIN_ADJUSTMENT}. Got ${amount}.`,
        });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: req.params.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });

    if (!wallet.address) {
        return res.status(400).json({ error: 'Wallet has no on-chain address.' });
    }

    // On-chain: transfer from treasury (deployer) to wallet
    let txHash;
    if (chainReady && forgeToken) {
        try {
            const amountWei = ethers.parseEther(amount.toString());
            const receipt = await submitTx(
                () => forgeToken.transfer(wallet.address, amountWei),
                `adminAdjust(${wallet.name}, ${amount})`,
            );
            txHash = receipt.hash;
        } catch (err) {
            logger.error({ err, walletId: wallet.id, amount }, 'On-chain admin adjustment failed');
            return res.status(500).json({ error: 'On-chain transfer failed.' });
        }
    } else {
        return res.status(503).json({ error: 'Chain not available for on-chain adjustments.' });
    }

    // DB record
    await prisma.transaction.create({
        data: {
            toId: wallet.id,
            amount: Math.abs(amount),
            type: 'ADMIN_ADJUSTMENT',
            memo: `[ADMIN ADJUST] ${memo} (tx: ${txHash})`,
        },
    });

    logger.info({
        adminAction: 'WALLET_ADJUST',
        walletId: wallet.id,
        walletName: wallet.name,
        amount,
        memo,
        txHash,
    }, 'Admin wallet adjustment (on-chain)');

    res.json({
        wallet: wallet.name,
        adjustment: amount,
        memo,
        txHash,
    });
});

// ─── Force-expire a puzzle ─────────────────────────────────

router.post('/puzzles/:id/force-expire', async (req, res) => {
    const puzzle = await prisma.puzzle.findUnique({ where: { id: req.params.id } });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });

    await prisma.puzzle.update({
        where: { id: puzzle.id },
        data: {
            status: 'EXPIRED',
            expiredAt: new Date(),
            revealDeadline: new Date(Date.now() + config.game.revealDeadlineSeconds * 1000),
        },
    });

    res.json({ message: `Puzzle ${puzzle.id} force-expired.` });
});

// ─── Create Bout (admin seeding) ───────────────────────────

router.post('/bouts', async (req, res) => {
    const { title, puzzleType, difficultyTier, entryFee, solveDurationSecs,
        scheduledAt, registrationOpensAt, bettingOpensAt, bettingClosesAt } = req.body;

    if (!title || !puzzleType || !difficultyTier || !scheduledAt) {
        return res.status(400).json({ error: 'Required: title, puzzleType, difficultyTier, scheduledAt' });
    }

    const bout = await prisma.bout.create({
        data: {
            title,
            puzzleType,
            difficultyTier,
            entryFee: entryFee || 500,
            solveDurationSecs: solveDurationSecs || 3600,
            scheduledAt: new Date(scheduledAt),
            registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : new Date(new Date(scheduledAt).getTime() - 48 * 3600000),
            bettingOpensAt: bettingOpensAt ? new Date(bettingOpensAt) : new Date(new Date(scheduledAt).getTime() - 12 * 3600000),
            bettingClosesAt: bettingClosesAt ? new Date(bettingClosesAt) : new Date(new Date(scheduledAt).getTime() - 1 * 3600000),
            status: 'SCHEDULED',
        },
    });

    logger.info({ boutId: bout.id, title: bout.title }, 'Admin created bout');
    res.status(201).json(bout);
});

// ─── Treasury Seed ─────────────────────────────────────────

router.post('/treasury/seed', async (req, res) => {
    const existing = await prisma.treasuryLedger.findFirst({
        orderBy: { createdAt: 'asc' },
    });

    if (existing) {
        if (req.query.force === 'true' && req.body.launchDate) {
            const newDate = new Date(req.body.launchDate);
            await prisma.treasuryLedger.update({
                where: { id: existing.id },
                data: { createdAt: newDate },
            });
            logger.info({ oldDate: existing.createdAt, newDate }, 'Treasury launch date updated');
            return res.json({ message: 'Treasury launch date updated', launchDate: newDate });
        }
        return res.json({ message: 'Treasury already seeded', launchDate: existing.createdAt });
    }

    // Default: launch 1 day ago, or use req.body.launchDate
    const launchDate = req.body.launchDate ? new Date(req.body.launchDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    await prisma.treasuryLedger.create({
        data: {
            action: 'PROTOCOL_LAUNCH',
            amount: 0,
            memo: 'Protocol launch — bootstrap emission schedule begins',
            createdAt: launchDate,
        },
    });

    logger.info({ launchDate }, 'Treasury seeded');
    res.status(201).json({ message: 'Treasury seeded', launchDate });
});

// ─── Trigger Emission ──────────────────────────────────────

router.post('/treasury/emit', async (req, res) => {
    try {
        // If force=true, delete today's emission entry first
        if (req.query.force === 'true') {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            await prisma.treasuryLedger.deleteMany({
                where: { action: 'BOOTSTRAP_EMISSION', createdAt: { gte: today } },
            });
            await prisma.treasuryLedger.deleteMany({
                where: { action: 'TREASURY_DEDUCTION', createdAt: { gte: today } },
            });
        }
        await runBootstrapEmission();
        res.json({ message: 'Bootstrap emission triggered' });
    } catch (err) {
        logger.error({ err }, 'Manual emission trigger failed');
        res.status(500).json({ error: err.message });
    }
});

// ─── Vault Sync (read on-chain positions → DB) ────────────

router.post('/vault/sync', async (req, res) => {
    if (!chainReady || !arenaVault) {
        return res.status(503).json({ error: 'Chain not ready' });
    }

    const covenantNames = ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'];
    const covConfigs = {
        FLAME: { lockDays: 1, apyBonus: 0, rageQuitMulti: 1.0 },
        STEEL: { lockDays: 3, apyBonus: 50, rageQuitMulti: 2.0 },
        OBSIDIAN: { lockDays: 7, apyBonus: 150, rageQuitMulti: 3.0 },
        ETERNAL: { lockDays: 30, apyBonus: 300, rageQuitMulti: 999 },
    };

    // Get all wallets with addresses
    const wallets = await prisma.wallet.findMany({
        where: { address: { not: null } },
    });

    let synced = 0;
    let skipped = 0;
    const results = [];

    for (const wallet of wallets) {
        try {
            const pos = await arenaVault.getPosition(wallet.address);
            const onChainActive = pos.active;
            const amount = Number(pos.amount / 10n ** 18n);

            if (!onChainActive || amount === 0) {
                skipped++;
                continue;
            }

            const covenant = covenantNames[Number(pos.covenant)] || 'FLAME';
            const covConfig = covConfigs[covenant];
            const lockExpiresAt = new Date(Number(pos.lockExpiresAt) * 1000);
            const stakedAt = new Date(Number(pos.stakedAt) * 1000);
            const daysStaked = Math.floor((Date.now() - stakedAt.getTime()) / (24 * 60 * 60 * 1000));

            // Check for existing active position
            const existing = await prisma.stakePosition.findFirst({
                where: { walletId: wallet.id, active: true },
            });

            if (existing) {
                // Update amount to match chain
                await prisma.stakePosition.update({
                    where: { id: existing.id },
                    data: {
                        amount,
                        covenant,
                        lockExpiresAt,
                        stakedAt,
                        apyBonus: covConfig.apyBonus,
                        rageQuitMulti: covConfig.rageQuitMulti,
                    },
                });
                results.push({ wallet: wallet.name, action: 'updated', amount, covenant });
            } else {
                // Create new position from chain data
                const loyaltySchedule = config.vault.loyaltySchedule;
                const loyaltyIdx = Math.min(daysStaked, loyaltySchedule.length - 1);

                await prisma.stakePosition.create({
                    data: {
                        walletId: wallet.id,
                        amount,
                        covenant,
                        lockDays: covConfig.lockDays,
                        apyBonus: covConfig.apyBonus,
                        rageQuitMulti: covConfig.rageQuitMulti,
                        lockExpiresAt,
                        stakedAt,
                        loyaltyMulti: loyaltySchedule[loyaltyIdx],
                        loyaltyWeek: 0,
                    },
                });
                results.push({ wallet: wallet.name, action: 'created', amount, covenant, daysStaked });
            }
            synced++;
        } catch (err) {
            results.push({ wallet: wallet.name, error: err.message });
        }
    }

    logger.info({ synced, skipped, total: wallets.length }, 'Vault sync completed');
    res.json({ synced, skipped, total: wallets.length, results });
});

// ─── Reset Event Cursor (force reindex) ────────────────────

router.post('/reindex', async (req, res) => {
    try {
        // Delete all event sync cursors so next restart replays all events
        const deleted = await prisma.eventSyncCursor.deleteMany();
        res.json({ message: `Reset ${deleted.count} event cursors. Restart or redeploy to replay events.` });
    } catch (err) {
        logger.error({ err }, 'Reindex cursor reset failed');
        res.status(500).json({ error: err.message });
    }
});

// ─── Clean Up Bouts ────────────────────────────────────────

router.post('/bouts/cleanup', async (req, res) => {
    const { before, boutIds } = req.body;
    const results = [];

    try {
        if (boutIds && Array.isArray(boutIds)) {
            // Delete or cancel specific bouts
            for (const id of boutIds) {
                const bout = await prisma.bout.findUnique({ where: { id } });
                if (!bout) { results.push({ id, status: 'not found' }); continue; }

                // Delete related records first
                await prisma.boutEntrant.deleteMany({ where: { boutId: id } });
                await prisma.bet.deleteMany({ where: { boutId: id } });
                await prisma.boutSubmission.deleteMany({ where: { boutId: id } });
                await prisma.bout.delete({ where: { id } });
                results.push({ id, title: bout.title, status: 'deleted' });
            }
        }

        if (before) {
            // Delete all bouts created before the cutoff
            const cutoff = new Date(before);
            const oldBouts = await prisma.bout.findMany({
                where: { createdAt: { lt: cutoff } },
            });

            for (const bout of oldBouts) {
                await prisma.boutEntrant.deleteMany({ where: { boutId: bout.id } });
                await prisma.bet.deleteMany({ where: { boutId: bout.id } });
                await prisma.boutSubmission.deleteMany({ where: { boutId: bout.id } });
                await prisma.bout.delete({ where: { id: bout.id } });
                results.push({ id: bout.id, title: bout.title, status: 'deleted' });
            }
        }

        logger.info({ count: results.length }, 'Bout cleanup completed');
        res.json({ deleted: results.length, results });
    } catch (err) {
        logger.error({ err }, 'Bout cleanup failed');
        res.status(500).json({ error: err.message, partialResults: results });
    }
});

export default router;
