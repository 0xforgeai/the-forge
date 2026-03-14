import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate, requireChain } from '../middleware/auth.js';
import logger from '../logger.js';
import sse from '../sse.js';
import { chainReady } from '../chain/index.js';
import { buyBondFor, claimYieldFor, pendingYield as chainPendingYield, getBond as chainGetBond } from '../chain/bonds.js';
import { balanceOf } from '../chain/token.js';

const router = Router();
const vc = config.victory;

// ─── List Active OTC Bonds (marketplace) ──────────────────

router.get('/', async (req, res) => {
    const bonds = await prisma.victoryBond.findMany({
        where: { status: 'ACTIVE', remainingValue: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
            creator: { select: { name: true } },
            bout: { select: { id: true, title: true } },
            fills: {
                select: { amount: true, pricePaid: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5,
            },
        },
    });

    res.json(bonds.map(b => ({
        id: b.id,
        boutId: b.boutId,
        boutTitle: b.bout.title,
        creator: b.creator.name,
        sourceType: b.sourceType,
        faceValue: b.faceValue,
        remainingValue: b.remainingValue,
        discountPercent: b.discountPercent,
        aprBps: b.aprBps,
        expiresAt: b.expiresAt,
        createdAt: b.createdAt,
        recentFills: b.fills,
    })));
});

// ─── My Bonds ─────────────────────────────────────────────

router.get('/my', authenticate, async (req, res) => {
    const wallet = req.wallet;

    const [created, purchased] = await Promise.all([
        prisma.victoryBond.findMany({
            where: { creatorId: wallet.id },
            orderBy: { createdAt: 'desc' },
            include: { bout: { select: { title: true } } },
        }),
        prisma.bondFill.findMany({
            where: { buyerId: wallet.id },
            orderBy: { createdAt: 'desc' },
            include: {
                bond: {
                    select: { faceValue: true, status: true, bout: { select: { title: true } } },
                },
            },
        }),
    ]);

    // Enrich with on-chain pending yield where available
    const createdBonds = await Promise.all(created.map(async b => {
        let onChainYield = null;
        if (chainReady && b.onChainBondId != null) {
            try {
                onChainYield = (await chainPendingYield(b.onChainBondId)).toString();
            } catch { /* swallow */ }
        }
        return {
            id: b.id,
            boutTitle: b.bout.title,
            faceValue: b.faceValue,
            remainingValue: b.remainingValue,
            status: b.status,
            expiresAt: b.expiresAt,
            createdAt: b.createdAt,
            onChainPendingYield: onChainYield,
        };
    }));

    res.json({
        created: createdBonds,
        purchased: purchased.map(f => ({
            fillId: f.id,
            bondId: f.bondId,
            boutTitle: f.bond.bout.title,
            amount: f.amount,
            pricePaid: f.pricePaid,
            bondStatus: f.bond.status,
            createdAt: f.createdAt,
        })),
    });
});

// ─── Bond Detail ──────────────────────────────────────────

router.get('/:id', async (req, res) => {
    const bond = await prisma.victoryBond.findUnique({
        where: { id: req.params.id },
        include: {
            creator: { select: { name: true } },
            bout: { select: { id: true, title: true } },
            fills: {
                include: { buyer: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
            },
        },
    });

    if (!bond) return res.status(404).json({ error: 'Bond not found.' });

    // On-chain pending yield
    let onChainYield = null;
    if (chainReady && bond.onChainBondId != null) {
        try {
            onChainYield = (await chainPendingYield(bond.onChainBondId)).toString();
        } catch { /* swallow */ }
    }

    res.json({
        id: bond.id,
        boutId: bond.boutId,
        boutTitle: bond.bout.title,
        creator: bond.creator.name,
        sourceType: bond.sourceType,
        faceValue: bond.faceValue,
        remainingValue: bond.remainingValue,
        discountPercent: bond.discountPercent,
        aprBps: bond.aprBps,
        status: bond.status,
        treasuryFilled: bond.treasuryFilled,
        expiresAt: bond.expiresAt,
        createdAt: bond.createdAt,
        filledAt: bond.filledAt,
        onChainPendingYield: onChainYield,
        fills: bond.fills.map(f => ({
            id: f.id,
            buyer: f.buyer.name,
            amount: f.amount,
            pricePaid: f.pricePaid,
            discountAmount: f.discountAmount,
            treasuryFill: f.treasuryFill,
            sellerReceived: f.sellerReceived,
            createdAt: f.createdAt,
        })),
    });
});

// ─── Buy Bond (full or partial) ───────────────────────────

const buySchema = z.object({
    amount: z.number().int().positive().optional(),
});

router.post('/:id/buy', authenticate, requireChain, async (req, res) => {
    const parsed = buySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    let result;

    try {
    result = await prisma.$transaction(async (tx) => {
        const bond = await tx.victoryBond.findUnique({
            where: { id: req.params.id },
            include: { creator: { select: { id: true, name: true } } },
        });

        if (!bond) throw new Error('BOND_NOT_FOUND');
        if (bond.status !== 'ACTIVE') throw new Error('BOND_NOT_ACTIVE');
        if (bond.creatorId === wallet.id) throw new Error('SELF_PURCHASE');

        // Determine purchase amount (face value portion)
        const remaining = Number(bond.remainingValue);
        const requestedAmount = parsed.data?.amount ?? remaining;

        if (requestedAmount > remaining) throw new Error('EXCEEDS_REMAINING');
        if (requestedAmount < vc.bond.partialFillMin && requestedAmount < remaining) {
            throw new Error('BELOW_MIN_FILL');
        }

        const amountBig = BigInt(requestedAmount);
        const discountPct = bond.discountPercent;
        const pricePaid = amountBig * BigInt(100 - discountPct) / 100n;
        const discountAmount = amountBig - pricePaid;

        // On-chain balance check
        if (!wallet.address) throw new Error('NO_ADDRESS');
        const onChainBalance = await balanceOf(wallet.address);
        const priceWei = ethers.parseEther(pricePaid.toString());
        if (onChainBalance < priceWei) {
            throw new Error('INSUFFICIENT_BALANCE');
        }

        // On-chain: buy bond (buyer must have approved ForgeBonds)
        let txHash;
        if (bond.onChainBondId != null) {
            const amountWei = ethers.parseEther(requestedAmount.toString());
            const receipt = await buyBondFor(bond.onChainBondId, amountWei, wallet.address);
            txHash = receipt.hash;
        }

        // Determine treasury fill (bootstrap period)
        let treasuryFill = 0n;
        let sellerReceived = pricePaid;

        const isBootstrap = await isWithinBootstrapPeriod(tx);
        if (isBootstrap) {
            const totalFilled = await tx.treasuryLedger.aggregate({
                where: { action: 'BOND_DISCOUNT_FILL' },
                _sum: { amount: true },
            });
            const budgetUsed = Number(totalFilled._sum.amount ?? 0n);
            const budgetRemaining = vc.bond.treasuryFillBudget - budgetUsed;

            if (budgetRemaining > 0) {
                treasuryFill = discountAmount <= BigInt(budgetRemaining) ? discountAmount : BigInt(budgetRemaining);
                sellerReceived = pricePaid + treasuryFill;
            }
        }

        // Treasury fill ledger
        if (treasuryFill > 0n) {
            await tx.treasuryLedger.create({
                data: {
                    action: 'BOND_DISCOUNT_FILL',
                    amount: treasuryFill,
                    memo: `Bootstrap bond discount fill for bond ${bond.id}`,
                },
            });
        }

        // Update bond
        const newRemaining = bond.remainingValue - amountBig;
        const isFilled = newRemaining <= 0n;

        await tx.victoryBond.update({
            where: { id: bond.id },
            data: {
                remainingValue: newRemaining,
                status: isFilled ? 'FILLED' : 'ACTIVE',
                filledAt: isFilled ? new Date() : null,
                treasuryFilled: treasuryFill > 0n ? true : bond.treasuryFilled,
            },
        });

        // Create fill record
        const fill = await tx.bondFill.create({
            data: {
                bondId: bond.id,
                buyerId: wallet.id,
                amount: amountBig,
                pricePaid,
                discountAmount,
                treasuryFill,
                sellerReceived,
            },
        });

        // Transaction records
        await tx.transaction.create({
            data: {
                fromId: wallet.id,
                toId: bond.creatorId,
                amount: pricePaid,
                type: 'BOND_PURCHASE',
                boutId: bond.boutId,
                memo: `Bond purchase: ${amountBig} face value at ${discountPct}% discount${txHash ? ` (tx: ${txHash})` : ''}`,
            },
        });

        await tx.transaction.create({
            data: {
                toId: bond.creatorId,
                amount: sellerReceived,
                type: 'BOND_SALE',
                boutId: bond.boutId,
                memo: `Bond sale proceeds: ${sellerReceived} (${treasuryFill > 0n ? 'treasury filled' : 'post-bootstrap'})`,
            },
        });

        return {
            fillId: fill.id,
            bondId: bond.id,
            amount: amountBig,
            pricePaid,
            discountAmount,
            treasuryFill,
            sellerReceived,
            seller: bond.creator.name,
            bondStatus: isFilled ? 'FILLED' : 'ACTIVE',
            remainingValue: newRemaining,
            txHash: txHash || null,
        };
    });
    } catch (err) {
        const handled = handleBondError(err, res);
        if (handled) return;
        throw err;
    }

    logger.info({
        bondId: result.bondId,
        buyer: wallet.name,
        seller: result.seller,
        amount: result.amount,
        pricePaid: result.pricePaid,
        treasuryFill: result.treasuryFill,
        txHash: result.txHash,
    }, 'Bond purchased (on-chain)');

    sse.broadcast('bond.purchased', {
        bondId: result.bondId,
        buyer: wallet.name,
        amount: result.amount,
        bondStatus: result.bondStatus,
    });

    res.status(201).json({
        ...result,
        message: `Purchased ${result.amount} face value for ${result.pricePaid} $FORGE (${vc.bond.discountPercent}% discount).`,
    });
});

// ─── Claim Accrued Yield ──────────────────────────────────

router.post('/:id/claim-yield', authenticate, requireChain, async (req, res) => {
    const wallet = req.wallet;
    let result;

    try {
        result = await prisma.$transaction(async (tx) => {
            const bond = await tx.victoryBond.findUnique({ where: { id: req.params.id } });
            if (!bond) throw new Error('BOND_NOT_FOUND');
            if (bond.creatorId !== wallet.id) throw new Error('NOT_OWNER');
            if (bond.status !== 'ACTIVE') throw new Error('BOND_NOT_ACTIVE');

            // On-chain: claim yield
            let txHash;
            let yieldClaimed = 0n;
            if (bond.onChainBondId != null) {
                // Read pending yield first
                const pending = await chainPendingYield(bond.onChainBondId);
                if (pending <= 0n) {
                    throw new Error('BOND_NOT_ACTIVE'); // reuse error — nothing to claim
                }

                const receipt = await claimYieldFor(bond.onChainBondId, wallet.address);
                txHash = receipt.hash;
                yieldClaimed = pending;
            }

            // Record transaction
            if (yieldClaimed > 0n) {
                await tx.transaction.create({
                    data: {
                        toId: wallet.id,
                        amount: yieldClaimed,
                        type: 'BOND_YIELD_CLAIM',
                        boutId: bond.boutId,
                        memo: `Bond yield claim (tx: ${txHash})`,
                    },
                });
            }

            return { bondId: bond.id, yieldClaimed, txHash: txHash || null };
        });
    } catch (err) {
        const handled = handleBondError(err, res);
        if (handled) return;
        throw err;
    }

    logger.info({ bondId: result.bondId, wallet: wallet.name, yield: result.yieldClaimed, txHash: result.txHash }, 'Bond yield claimed (on-chain)');

    res.json({
        ...result,
        message: `Claimed ${result.yieldClaimed} $FORGE yield from bond.`,
    });
});

/**
 * Check if we're within the bootstrap period (first N days).
 */
async function isWithinBootstrapPeriod(tx) {
    const firstEntry = await tx.treasuryLedger.findFirst({
        orderBy: { createdAt: 'asc' },
    });
    if (!firstEntry) return false;

    const daysSinceLaunch = Math.floor((Date.now() - firstEntry.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceLaunch <= vc.bond.treasuryFillDays;
}

// Error handler for interactive transactions
function handleBondError(err, res) {
    const map = {
        BOND_NOT_FOUND: [404, 'Bond not found.'],
        BOND_NOT_ACTIVE: [400, 'Bond is no longer active or has no yield.'],
        SELF_PURCHASE: [400, "You can't buy your own bond."],
        EXCEEDS_REMAINING: [400, 'Amount exceeds remaining bond value.'],
        BELOW_MIN_FILL: [400, `Minimum partial fill is ${vc.bond.partialFillMin} $FORGE.`],
        NOT_OWNER: [403, 'You are not the bond creator.'],
        NO_ADDRESS: [400, 'No on-chain address linked. Register with an address.'],
        INSUFFICIENT_BALANCE: [400, 'Insufficient on-chain balance for this purchase.'],
    };

    const entry = map[err.message];
    if (entry) {
        res.status(entry[0]).json({ error: entry[1] });
        return true;
    }
    return false;
}

export default router;
