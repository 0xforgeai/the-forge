/**
 * Bootstrap Emission Job
 *
 * Runs daily during the 10-day Ignition phase.
 * - Computes APY emission based on on-chain totalStaked
 * - Calls depositYield() on ArenaVault (contract distributes proportionally)
 * - Tracks all emissions in TreasuryLedger
 *
 * After day 10, the job stops emitting — yield becomes fully organic.
 */

import cron from 'node-cron';
import { ethers } from 'ethers';
import prisma from '../db.js';
import config from '../config.js';
import { forgeToken, arenaVault, chainReady } from '../chain/index.js';
import { submitTx } from '../chain/tx.js';
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

export async function runBootstrapEmission() {
    // Get the protocol launch date from the first treasury ledger entry
    // Look for the PROTOCOL_LAUNCH entry specifically
    const launchEntry = await prisma.treasuryLedger.findFirst({
        where: { action: 'PROTOCOL_LAUNCH' },
        orderBy: { createdAt: 'asc' },
    }) || await prisma.treasuryLedger.findFirst({
        orderBy: { createdAt: 'asc' },
    });

    if (!launchEntry) {
        logger.debug('No treasury entries — protocol not yet started');
        return;
    }

    const launchDate = launchEntry.createdAt;
    const daysSinceLaunch = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));
    logger.info({ launchDate, daysSinceLaunch, action: launchEntry.action }, 'Bootstrap: launch date resolved');

    // Find the active schedule tier
    const activeTier = bootstrap.schedule.find(
        t => daysSinceLaunch >= t.dayStart && daysSinceLaunch <= t.dayEnd
    );

    if (!activeTier) {
        // Past day 10 — no more emissions
        return;
    }

    // Check if we already emitted today (H-5 fix: use UTC explicitly)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const alreadyEmitted = await prisma.treasuryLedger.findFirst({
        where: {
            action: 'BOOTSTRAP_EMISSION',
            createdAt: { gte: today },
        },
    });

    if (alreadyEmitted) return;

    // ── Get total staked from on-chain (source of truth) ──
    if (!chainReady || !arenaVault || !forgeToken) {
        logger.warn('Chain not ready — skipping emission');
        return;
    }

    let totalStakedWei;
    try {
        totalStakedWei = await arenaVault.totalStaked();
    } catch (err) {
        logger.error({ err }, 'Failed to read totalStaked from chain');
        return;
    }

    const totalStakedTokens = Number(totalStakedWei / 10n ** 18n);
    if (totalStakedTokens === 0) {
        logger.debug({ day: daysSinceLaunch }, 'No stakers on-chain — skipping emission');
        return;
    }

    // Daily APY = annualized rate / 365
    const dailyRate = activeTier.apyPercent / 365 / 100;
    const totalEmitted = Math.floor(totalStakedTokens * dailyRate);

    if (totalEmitted <= 0) return;

    // ── Record emission in treasury ledger ────────────
    await prisma.$transaction([
        prisma.treasuryLedger.create({
            data: {
                action: 'BOOTSTRAP_EMISSION',
                amount: totalEmitted,
                memo: `Day ${daysSinceLaunch} emission: ${activeTier.apyPercent}% APY on ${totalStakedTokens} staked`,
            },
        }),
        prisma.treasuryLedger.create({
            data: {
                action: 'TREASURY_DEDUCTION',
                amount: -totalEmitted,
                memo: `Treasury deduction for Day ${daysSinceLaunch} bootstrap emission`,
            },
        }),
    ]);

    // ── On-chain: deposit yield to ArenaVault ────────────
    // The contract distributes proportionally via rewardPerToken
    try {
        const emittedWei = ethers.parseEther(totalEmitted.toString());
        const deployerAddr = config.chain.deployerAddress;

        // Balance check: ensure deployer holds enough tokens
        const balance = await forgeToken.balanceOf(deployerAddr);
        if (balance < emittedWei) {
            logger.error({
                required: totalEmitted,
                balance: balance.toString(),
            }, 'Deployer has insufficient $FORGE balance for depositYield — skipping on-chain deposit');
        } else {
            const vaultAddress = config.chain.arenaVaultAddress;

            await submitTx(
                () => forgeToken.approve(vaultAddress, emittedWei),
                'approve for depositYield',
            );

            const depositReceipt = await submitTx(
                () => arenaVault.depositYield(emittedWei),
                'depositYield',
            );

            logger.info({ totalEmitted, txHash: depositReceipt.hash }, 'On-chain: depositYield() confirmed');
        }
    } catch (err) {
        logger.error({ err, totalEmitted }, 'On-chain depositYield failed — treasury ledger still updated');
    }

    // ── Also update DB stake positions if any exist ────────
    const activeStakes = await prisma.stakePosition.findMany({ where: { active: true } });
    if (activeStakes.length > 0) {
        const ops = [];

        for (const stake of activeStakes) {
            const stakeAmount = Number(stake.amount);
            const covenantBonus = 1 + (stake.apyBonus / 100);
            const emission = Math.floor(stakeAmount * dailyRate * stake.loyaltyMulti * covenantBonus);
            if (emission <= 0) continue;

            ops.push(prisma.stakePosition.update({
                where: { id: stake.id },
                data: { unvestedRewards: { increment: emission } },
            }));
        }

        // Update loyalty multipliers
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

        // Process vesting
        for (const stake of activeStakes) {
            const unvested = Number(stake.unvestedRewards);
            if (unvested <= 0) continue;
            const vestAmount = Math.floor(unvested / vc.vestingDays);
            if (vestAmount <= 0) continue;
            ops.push(prisma.stakePosition.update({
                where: { id: stake.id },
                data: {
                    unvestedRewards: { decrement: vestAmount },
                    vestedAmount: { increment: vestAmount },
                },
            }));
        }

        if (ops.length > 0) await prisma.$transaction(ops);
    }

    logger.info({
        day: daysSinceLaunch,
        apyPercent: activeTier.apyPercent,
        totalStakedTokens,
        totalEmitted,
    }, 'Bootstrap emission distributed');

    sse.broadcast('bootstrap.emission', {
        day: daysSinceLaunch,
        apyPercent: activeTier.apyPercent,
        totalEmitted,
        totalStakedTokens,
    });
}
