/**
 * Bootstrap Emission Job
 *
 * Runs daily during the 10-day Ignition phase.
 * - Distributes APY emissions to active vault stakers
 * - Injects bonus $FORGE into upcoming bout purses
 * - Tracks all emissions in TreasuryLedger
 *
 * After day 10, the job stops emitting — yield becomes fully organic.
 */

import cron from 'node-cron';
import prisma from '../db.js';
import config from '../config.js';
import logger from '../logger.js';
import sse from '../sse.js';

const { bootstrap, vault: vc } = config;

export function startBootstrapJob() {
    // Run every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        try {
            await runBootstrapEmission();
        } catch (err) {
            logger.error({ err }, 'Bootstrap emission job error');
        }
    });
    logger.info('Bootstrap emission job started (every 6h)');
}

async function runBootstrapEmission() {
    // Get the protocol launch date from the first treasury ledger entry
    const firstEntry = await prisma.treasuryLedger.findFirst({
        orderBy: { createdAt: 'asc' },
    });

    if (!firstEntry) {
        logger.debug('No treasury entries — protocol not yet started');
        return;
    }

    const launchDate = firstEntry.createdAt;
    const daysSinceLaunch = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));

    // Find the active schedule tier
    const activeTier = bootstrap.schedule.find(
        t => daysSinceLaunch >= t.dayStart && daysSinceLaunch <= t.dayEnd
    );

    if (!activeTier) {
        // Past day 10 — no more emissions
        return;
    }

    // Check if we already emitted today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alreadyEmitted = await prisma.treasuryLedger.findFirst({
        where: {
            action: 'BOOTSTRAP_EMISSION',
            createdAt: { gte: today },
        },
    });

    if (alreadyEmitted) return;

    // ── Distribute APY to active stakers ──────────────
    const activeStakes = await prisma.stakePosition.findMany({
        where: { active: true },
    });

    if (activeStakes.length === 0) {
        logger.debug({ day: daysSinceLaunch }, 'No active stakers — skipping emission');
        return;
    }

    // Daily APY = annualized rate / 365
    const dailyRate = activeTier.apyPercent / 365 / 100;
    const ops = [];
    let totalEmitted = 0;

    for (const stake of activeStakes) {
        // Weighted emission: stake × dailyRate × loyalty × (1 + apyBonus%)
        const covenantBonus = 1 + (stake.apyBonus / 100);
        const emission = Math.floor(stake.amount * dailyRate * stake.loyaltyMulti * covenantBonus);

        if (emission <= 0) continue;

        totalEmitted += emission;

        // Add to unvested rewards (vests linearly over 5 days)
        ops.push(prisma.stakePosition.update({
            where: { id: stake.id },
            data: {
                unvestedRewards: { increment: emission },
            },
        }));
    }

    // Treasury ledger entry
    if (totalEmitted > 0) {
        ops.push(prisma.treasuryLedger.create({
            data: {
                action: 'BOOTSTRAP_EMISSION',
                amount: totalEmitted,
                memo: `Day ${daysSinceLaunch} emission: ${activeTier.apyPercent}% APY to ${activeStakes.length} stakers`,
            },
        }));
    }

    // ── Process vesting for all stakers ────────────
    // Vest 1/vestingDays of unvested rewards per day
    for (const stake of activeStakes) {
        if (stake.unvestedRewards <= 0) continue;

        const vestAmount = Math.floor(stake.unvestedRewards / vc.vestingDays);
        if (vestAmount <= 0) continue;

        ops.push(prisma.stakePosition.update({
            where: { id: stake.id },
            data: {
                unvestedRewards: { decrement: vestAmount },
                vestedAmount: { increment: vestAmount },
            },
        }));

        // Credit vested amount to wallet
        ops.push(prisma.wallet.update({
            where: { id: stake.walletId },
            data: { balance: { increment: vestAmount } },
        }));

        ops.push(prisma.transaction.create({
            data: {
                toId: stake.walletId,
                amount: vestAmount,
                type: 'VAULT_VESTING',
                memo: `Vested yield: ${vestAmount} $FORGE`,
            },
        }));
    }

    // ── Update loyalty multipliers ────────────────
    for (const stake of activeStakes) {
        const daysStaked = Math.floor((Date.now() - stake.stakedAt.getTime()) / (1000 * 60 * 60 * 24));
        const scheduleIndex = Math.min(daysStaked, vc.loyaltySchedule.length - 1);
        const newMulti = vc.loyaltySchedule[scheduleIndex];

        if (newMulti !== stake.loyaltyMulti) {
            ops.push(prisma.stakePosition.update({
                where: { id: stake.id },
                data: { loyaltyMulti: newMulti },
            }));
        }
    }

    if (ops.length > 0) {
        await prisma.$transaction(ops);
    }

    logger.info({
        day: daysSinceLaunch,
        apyPercent: activeTier.apyPercent,
        totalEmitted,
        stakers: activeStakes.length,
    }, 'Bootstrap emission distributed');

    sse.broadcast('bootstrap.emission', {
        day: daysSinceLaunch,
        apyPercent: activeTier.apyPercent,
        totalEmitted,
        stakers: activeStakes.length,
    });
}
