/**
 * Bond Yield Job
 *
 * Runs every 6 hours (alongside bootstrap job).
 * - Accrues floating APR on active victory bonds
 * - Expires bonds past their expiry date (returns principal + yield to creator)
 *
 * APR is floating: mirrors the current staking APR from the bootstrap schedule.
 * Post-bootstrap, falls back to a base organic rate (5%).
 */

import cron from 'node-cron';
import prisma from '../db.js';
import config from '../config.js';
import logger from '../logger.js';

const BASE_APR_BPS = 500; // 5% base APR post-bootstrap

export function startBondYieldJob() {
    // Run every 6 hours (offset by 1 hour from bootstrap to spread load)
    cron.schedule('0 1,7,13,19 * * *', async () => {
        try {
            await accrueYield();
            await expireBonds();
        } catch (err) {
            logger.error({ err }, 'Bond yield job error');
        }
    });
    logger.info('Bond yield job started (every 6h)');
}

/**
 * Accrue yield on all active bonds based on current floating APR.
 */
async function accrueYield() {
    const activeBonds = await prisma.victoryBond.findMany({
        where: { status: 'ACTIVE', remainingValue: { gt: 0 } },
    });

    if (activeBonds.length === 0) return;

    const currentAprBps = await getCurrentAprBps();
    const now = new Date();
    const ops = [];
    let totalYieldAccrued = 0;

    for (const bond of activeBonds) {
        const hoursSinceLastYield = (now.getTime() - bond.lastYieldAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastYield < 1) continue; // skip if less than 1 hour

        // yield = remainingValue * (aprBps / 10000) * (hours / 8760)
        const remaining = Number(bond.remainingValue);
        const yieldAmount = Math.floor(remaining * currentAprBps / 10000 * hoursSinceLastYield / 8760);

        if (yieldAmount <= 0) continue;

        totalYieldAccrued += yieldAmount;

        ops.push(prisma.victoryBond.update({
            where: { id: bond.id },
            data: {
                accruedYield: { increment: yieldAmount },
                aprBps: currentAprBps, // update to current floating rate
                lastYieldAt: now,
            },
        }));
    }

    if (totalYieldAccrued > 0) {
        // Record yield emission in treasury ledger
        ops.push(prisma.treasuryLedger.create({
            data: {
                action: 'BOND_YIELD',
                amount: totalYieldAccrued,
                memo: `Bond yield accrual: ${activeBonds.length} bonds, ${currentAprBps}bps APR`,
            },
        }));

        await prisma.$transaction(ops);
    }

    logger.info({
        bonds: activeBonds.length,
        totalYieldAccrued,
        aprBps: currentAprBps,
    }, 'Bond yield accrued');
}

/**
 * Expire bonds past their expiry date.
 * Returns remaining principal + accrued yield to creator.
 */
async function expireBonds() {
    const now = new Date();
    const expiredBonds = await prisma.victoryBond.findMany({
        where: {
            status: 'ACTIVE',
            expiresAt: { lte: now },
        },
    });

    for (const bond of expiredBonds) {
        const returnAmount = bond.remainingValue + bond.accruedYield;

        const ops = [
            prisma.victoryBond.update({
                where: { id: bond.id },
                data: { status: 'EXPIRED' },
            }),
        ];

        if (returnAmount > 0n) {
            ops.push(prisma.wallet.update({
                where: { id: bond.creatorId },
                data: { balance: { increment: returnAmount } },
            }));

            ops.push(prisma.transaction.create({
                data: {
                    toId: bond.creatorId,
                    amount: returnAmount,
                    type: 'BOND_EXPIRY_RETURN',
                    boutId: bond.boutId,
                    memo: `Bond expired: ${bond.remainingValue} principal + ${bond.accruedYield} yield returned`,
                },
            }));
        }

        await prisma.$transaction(ops);

        logger.info({
            bondId: bond.id,
            creatorId: bond.creatorId,
            returned: returnAmount,
        }, 'Bond expired — principal + yield returned to creator');
    }

    if (expiredBonds.length > 0) {
        logger.info({ count: expiredBonds.length }, 'Expired bonds processed');
    }
}

/**
 * Get current staking APR in basis points (floating).
 */
async function getCurrentAprBps() {
    const firstEntry = await prisma.treasuryLedger.findFirst({
        orderBy: { createdAt: 'asc' },
    });

    if (!firstEntry) return BASE_APR_BPS;

    const daysSinceLaunch = Math.floor((Date.now() - firstEntry.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const activeTier = config.bootstrap.schedule.find(
        t => daysSinceLaunch >= t.dayStart && daysSinceLaunch <= t.dayEnd
    );

    if (activeTier) {
        return activeTier.apyPercent * 100; // percent to basis points
    }

    return BASE_APR_BPS;
}
