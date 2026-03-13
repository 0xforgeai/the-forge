import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../logger.js';
import sse from '../sse.js';

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
        accruedYield: b.accruedYield,
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

    res.json({
        created: created.map(b => ({
            id: b.id,
            boutTitle: b.bout.title,
            faceValue: b.faceValue,
            remainingValue: b.remainingValue,
            accruedYield: b.accruedYield,
            status: b.status,
            expiresAt: b.expiresAt,
            createdAt: b.createdAt,
        })),
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
        accruedYield: bond.accruedYield,
        status: bond.status,
        treasuryFilled: bond.treasuryFilled,
        expiresAt: bond.expiresAt,
        createdAt: bond.createdAt,
        filledAt: bond.filledAt,
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

router.post('/:id/buy', authenticate, async (req, res) => {
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

        // Check buyer balance
        const freshWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
        if (freshWallet.balance < pricePaid) throw new Error('INSUFFICIENT_BALANCE');

        // Determine treasury fill (bootstrap period)
        let treasuryFill = 0n;
        let sellerReceived = pricePaid;

        const isBootstrap = await isWithinBootstrapPeriod(tx);
        if (isBootstrap) {
            // Check treasury budget for bond fills
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

        // Deduct from buyer
        await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: pricePaid } },
        });

        // Credit seller
        await tx.wallet.update({
            where: { id: bond.creatorId },
            data: { balance: { increment: sellerReceived } },
        });

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

        // Transfer accrued yield to creator (they held the bond)
        if (bond.accruedYield > 0n) {
            await tx.wallet.update({
                where: { id: bond.creatorId },
                data: { balance: { increment: bond.accruedYield } },
            });
            await tx.transaction.create({
                data: {
                    toId: bond.creatorId,
                    amount: bond.accruedYield,
                    type: 'BOND_YIELD_CLAIM',
                    boutId: bond.boutId,
                    memo: `Bond yield claimed on sale: ${bond.id}`,
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
                accruedYield: 0, // reset after payout
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
                memo: `Bond purchase: ${amountBig} face value at ${discountPct}% discount`,
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
            yieldPaidToSeller: bond.accruedYield,
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
    }, 'Bond purchased');

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

router.post('/:id/claim-yield', authenticate, async (req, res) => {
    const wallet = req.wallet;
    let result;

    try {
        result = await prisma.$transaction(async (tx) => {
            const bond = await tx.victoryBond.findUnique({ where: { id: req.params.id } });
            if (!bond) throw new Error('BOND_NOT_FOUND');
            if (bond.creatorId !== wallet.id) throw new Error('NOT_OWNER');
            if (bond.status !== 'ACTIVE') throw new Error('BOND_NOT_ACTIVE');
            if (bond.accruedYield <= 0n) throw new Error('NO_YIELD');

            const yieldAmount = bond.accruedYield;

            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: yieldAmount } },
            });

            await tx.victoryBond.update({
                where: { id: bond.id },
                data: { accruedYield: 0 },
            });

            await tx.transaction.create({
                data: {
                    toId: wallet.id,
                    amount: yieldAmount,
                    type: 'BOND_YIELD_CLAIM',
                    boutId: bond.boutId,
                    memo: `Bond yield claimed: ${bond.id}`,
                },
            });

            return { bondId: bond.id, yieldClaimed: yieldAmount };
        });
    } catch (err) {
        const handled = handleBondError(err, res);
        if (handled) return;
        throw err;
    }

    logger.info({ bondId: result.bondId, wallet: wallet.name, yield: result.yieldClaimed }, 'Bond yield claimed');

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
        BOND_NOT_ACTIVE: [400, 'Bond is no longer active.'],
        SELF_PURCHASE: [400, "You can't buy your own bond."],
        EXCEEDS_REMAINING: [400, 'Amount exceeds remaining bond value.'],
        BELOW_MIN_FILL: [400, `Minimum partial fill is ${vc.bond.partialFillMin} $FORGE.`],
        INSUFFICIENT_BALANCE: [400, 'Insufficient balance.'],
        NOT_OWNER: [403, 'You are not the bond creator.'],
        NO_YIELD: [400, 'No accrued yield to claim.'],
    };

    const entry = map[err.message];
    const entry = map[err.message];
    if (entry) {
        res.status(entry[0]).json({ error: entry[1] });
        return true;
    }
    return false;
}

export default router;
