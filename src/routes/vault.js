import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate } from '../middleware/auth.js';
import sse from '../sse.js';
import logger from '../logger.js';

const router = Router();
const vc = config.vault;

// ─── Helpers ───────────────────────────────────────────────

function getLoyaltyMultiplier(daysStaked) {
    const schedule = vc.loyaltySchedule;
    const idx = Math.min(daysStaked, schedule.length - 1);
    return schedule[idx] || 1.0;
}

function getRageQuitTaxPercent(daysStaked, rageQuitMulti) {
    const baseTax = vc.rageQuitTax[Math.min(daysStaked, vc.rageQuitTax.length - 1)] || 0;
    return Math.min(baseTax * rageQuitMulti, 100);
}

function getDaysStaked(stakedAt) {
    return Math.floor((Date.now() - stakedAt.getTime()) / (24 * 60 * 60 * 1000));
}

// ─── Vault Info (public) ───────────────────────────────────

router.get('/info', async (req, res) => {
    const activeStakes = await prisma.stakePosition.findMany({ where: { active: true } });
    const totalStaked = activeStakes.reduce((s, p) => s + p.amount, 0);
    const totalStakers = activeStakes.length;
    const avgMulti = totalStakers > 0
        ? (activeStakes.reduce((s, p) => s + p.loyaltyMulti, 0) / totalStakers).toFixed(2)
        : '1.00';

    const covenantBreakdown = {};
    for (const p of activeStakes) {
        covenantBreakdown[p.covenant] = (covenantBreakdown[p.covenant] || 0) + 1;
    }

    const totalEarned = activeStakes.reduce((s, p) => s + p.totalEarned, 0);

    // Get total burns from treasury ledger
    const burnResult = await prisma.treasuryLedger.aggregate({
        where: { action: 'BURN' },
        _sum: { amount: true },
    });

    res.json({
        totalStaked,
        totalStakers,
        avgLoyaltyMultiplier: parseFloat(avgMulti),
        covenantBreakdown,
        totalEarned,
        totalBurned: burnResult._sum.amount || 0,
        covenants: Object.entries(vc.covenants).map(([name, c]) => ({
            name,
            lockDays: c.lockDays,
            apyBonus: c.apyBonus,
            rageQuitMulti: c.rageQuitMulti === Infinity ? 'NO UNSTAKE' : `${c.rageQuitMulti}x`,
        })),
        loyaltySchedule: vc.loyaltySchedule,
        rageQuitTax: vc.rageQuitTax,
    });
});

// ─── My Stake (auth) ───────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
    const positions = await prisma.stakePosition.findMany({
        where: { walletId: req.wallet.id },
        orderBy: { stakedAt: 'desc' },
    });

    const active = positions.find(p => p.active);
    if (!active) {
        return res.json({ staked: false, positions: positions.map(formatPosition) });
    }

    const days = getDaysStaked(active.stakedAt);
    const loyalty = getLoyaltyMultiplier(days);
    const rageQuitPct = getRageQuitTaxPercent(days, active.rageQuitMulti);

    res.json({
        staked: true,
        active: {
            ...formatPosition(active),
            currentDay: days,
            currentLoyaltyMulti: loyalty,
            currentRageQuitTax: `${rageQuitPct}%`,
            rageQuitCost: Math.floor(active.amount * rageQuitPct / 100),
            youWouldReceive: active.amount - Math.floor(active.amount * rageQuitPct / 100),
            lockExpired: new Date() >= active.lockExpiresAt,
        },
        history: positions.filter(p => !p.active).map(formatPosition),
    });
});

function formatPosition(p) {
    return {
        id: p.id,
        amount: p.amount,
        covenant: p.covenant,
        lockDays: p.lockDays,
        apyBonus: p.apyBonus,
        loyaltyMulti: p.loyaltyMulti,
        loyaltyWeek: p.loyaltyWeek,
        stakedAt: p.stakedAt,
        lockExpiresAt: p.lockExpiresAt,
        unstakedAt: p.unstakedAt,
        active: p.active,
        totalEarned: p.totalEarned,
        totalTaxPaid: p.totalTaxPaid,
        vestedAmount: p.vestedAmount,
        unvestedRewards: p.unvestedRewards,
    };
}

// ─── Stake ─────────────────────────────────────────────────

const stakeSchema = z.object({
    amount: z.number().int().min(100),
    covenant: z.enum(['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL']),
});

router.post('/stake', authenticate, async (req, res) => {
    const parsed = stakeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const wallet = req.wallet;
    const { amount, covenant } = parsed.data;

    // Check for existing active stake
    const existing = await prisma.stakePosition.findFirst({
        where: { walletId: wallet.id, active: true },
    });
    if (existing) {
        return res.status(400).json({ error: 'You already have an active stake. Unstake first.' });
    }

    // Balance check
    if (wallet.balance < amount) {
        return res.status(400).json({ error: `Insufficient balance. Need ${amount}, have ${wallet.balance}.` });
    }

    // Min stake check
    if (amount < vc.minStake) {
        return res.status(400).json({ error: `Minimum stake is ${vc.minStake} $FORGE.` });
    }

    const covConfig = vc.covenants[covenant];
    const lockExpiresAt = new Date(Date.now() + covConfig.lockDays * 24 * 60 * 60 * 1000);

    // First staker bonus check
    let bonus = 0;
    const totalStakers = await prisma.stakePosition.count();
    for (const tier of config.bootstrap.firstStakerBonuses) {
        if (totalStakers < tier.maxStaker) {
            bonus = tier.bonus;
            break;
        }
    }

    const [position] = await prisma.$transaction([
        prisma.stakePosition.create({
            data: {
                walletId: wallet.id,
                amount: amount + bonus,
                covenant,
                lockDays: covConfig.lockDays,
                apyBonus: covConfig.apyBonus,
                // C-4 fix: use 999 as sentinel for ETERNAL (matches onchain 10000/100 = 100x cap)
                rageQuitMulti: covConfig.rageQuitMulti === Infinity ? 999 : covConfig.rageQuitMulti,
                lockExpiresAt,
                loyaltyMulti: 1.0,
                loyaltyWeek: 0,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: amount } },
        }),
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount,
                type: 'VAULT_STAKE',
                memo: `Staked ${amount} $FORGE — ${covenant} covenant${bonus > 0 ? ` (+${bonus} first-staker bonus)` : ''}`,
            },
        }),
    ]);

    logger.info({
        agent: wallet.name,
        amount,
        covenant,
        lockDays: covConfig.lockDays,
        bonus,
        stakeId: position.id,
    }, 'Agent staked in Arena Vault');

    sse.broadcast('vault.stake', {
        agent: wallet.name,
        amount: amount + bonus,
        covenant,
        totalStakers: totalStakers + 1,
    });

    res.status(201).json({
        stakeId: position.id,
        amount: amount + bonus,
        covenant,
        lockDays: covConfig.lockDays,
        lockExpiresAt,
        apyBonus: covConfig.apyBonus,
        firstStakerBonus: bonus,
        message: `Staked ${amount}${bonus > 0 ? ` (+${bonus} bonus)` : ''} $FORGE under ${covenant} covenant. Lock: ${covConfig.lockDays} days.`,
    });
});

// ─── Unstake ───────────────────────────────────────────────

router.post('/unstake', authenticate, async (req, res) => {
    const wallet = req.wallet;

    const position = await prisma.stakePosition.findFirst({
        where: { walletId: wallet.id, active: true },
    });
    if (!position) {
        return res.status(400).json({ error: 'No active stake found.' });
    }

    // Lock period check — applies to ALL covenants including ETERNAL (H-10 fix)
    const now = new Date();
    if (now < position.lockExpiresAt) {
        const daysLeft = Math.ceil((position.lockExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const eternalNote = position.covenant === 'ETERNAL'
            ? ' ETERNAL covenant — this is the price of maximum yield.'
            : '';
        return res.status(400).json({
            error: `Lock period not expired. ${daysLeft} days remaining. You chose ${position.covenant}.${eternalNote}`,
        });
    }

    // Calculate rage quit tax
    const daysStaked = getDaysStaked(position.stakedAt);
    const rageQuitPct = getRageQuitTaxPercent(daysStaked, position.rageQuitMulti);
    const taxAmount = Math.floor(position.amount * rageQuitPct / 100);
    const returnAmount = position.amount - taxAmount;

    // Forfeit unvested rewards
    const forfeitedRewards = position.unvestedRewards;

    const ops = [
        prisma.stakePosition.update({
            where: { id: position.id },
            data: {
                active: false,
                unstakedAt: now,
                totalTaxPaid: taxAmount,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: returnAmount } },
        }),
        prisma.transaction.create({
            data: {
                toId: wallet.id,
                amount: returnAmount,
                type: 'VAULT_UNSTAKE',
                memo: `Unstaked after ${daysStaked} days. Tax: ${rageQuitPct}% (${taxAmount})`,
            },
        }),
    ];

    // Tax goes to remaining stakers (distributed later by yield job)
    if (taxAmount > 0) {
        ops.push(prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: taxAmount,
                type: 'VAULT_RAGE_TAX',
                memo: `Rage quit tax: ${rageQuitPct}% after ${daysStaked} days`,
            },
        }));
        ops.push(prisma.treasuryLedger.create({
            data: {
                action: 'RAGE_TAX',
                amount: taxAmount,
                memo: `${wallet.name} rage quit — ${rageQuitPct}% tax on ${position.amount}`,
            },
        }));
    }

    // Forfeit unvested rewards back to treasury
    if (forfeitedRewards > 0) {
        ops.push(prisma.treasuryLedger.create({
            data: {
                action: 'FORFEITED_VESTING',
                amount: forfeitedRewards,
                memo: `${wallet.name} forfeited ${forfeitedRewards} unvested rewards`,
            },
        }));
    }

    await prisma.$transaction(ops);

    logger.info({
        agent: wallet.name,
        amount: position.amount,
        returned: returnAmount,
        taxed: taxAmount,
        rageQuitPct,
        daysStaked,
        forfeitedRewards,
    }, 'Agent unstaked from Arena Vault');

    sse.broadcast('vault.unstake', {
        agent: wallet.name,
        returned: returnAmount,
        taxed: taxAmount,
        covenant: position.covenant,
    });

    res.json({
        unstaked: true,
        originalAmount: position.amount,
        rageQuitTax: `${rageQuitPct}%`,
        taxAmount,
        returned: returnAmount,
        forfeitedRewards,
        daysStaked,
        message: taxAmount > 0
            ? `Unstaked. Rage quit tax: ${taxAmount} (${rageQuitPct}%). Returned: ${returnAmount} $FORGE. Loyalty multiplier reset.`
            : `Unstaked ${returnAmount} $FORGE. No tax — you served your time. Loyalty multiplier reset.`,
    });
});

export default router;
