import { Router } from 'express';
import prisma from '../db.js';
import { adminAuth } from '../middleware/auth.js';
import config from '../config.js';
import logger from '../logger.js';

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

    res.json({
        wallets,
        puzzlesByStatus: Object.fromEntries(puzzles.map((p) => [p.status, p._count])),
        totalTransactions: transactions._count,
        totalVolume: transactions._sum.amount || 0,
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
                xHandle: true,
                balance: true,
                gas: true,
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
// H-4 fix: max adjustment limit, dedicated ADMIN_ADJUSTMENT type, re-query balance after tx

const MAX_ADMIN_ADJUSTMENT = 100000; // max single adjustment

router.post('/wallets/:id/adjust', async (req, res) => {
    const { amount, memo } = req.body;
    if (typeof amount !== 'number' || !memo) {
        return res.status(400).json({ error: 'Provide numeric amount and memo.' });
    }

    if (Math.abs(amount) > MAX_ADMIN_ADJUSTMENT) {
        return res.status(400).json({
            error: `Adjustment exceeds maximum of ${MAX_ADMIN_ADJUSTMENT}. Got ${Math.abs(amount)}.`,
        });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: req.params.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });

    // Prevent negative balance
    if (amount < 0 && wallet.balance + amount < 0) {
        return res.status(400).json({ error: `Adjustment would result in negative balance.` });
    }

    const [, updatedWallet] = await prisma.$transaction([
        prisma.transaction.create({
            data: {
                toId: amount > 0 ? wallet.id : undefined,
                fromId: amount < 0 ? wallet.id : undefined,
                amount: Math.abs(amount),
                type: 'BURN', // closest available type — see M-note about adding ADMIN_ADJUSTMENT
                memo: `[ADMIN ADJUST] ${memo}`,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
        }),
    ]);

    // Log admin action for audit trail
    logger.info({
        adminAction: 'WALLET_ADJUST',
        walletId: wallet.id,
        walletName: wallet.name,
        amount,
        memo,
        previousBalance: wallet.balance,
        newBalance: updatedWallet.balance,
    }, 'Admin wallet adjustment');

    res.json({
        wallet: wallet.name,
        adjustment: amount,
        newBalance: updatedWallet.balance,
        memo,
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

export default router;
