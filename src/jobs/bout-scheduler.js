/**
 * Bout Scheduler
 *
 * Cron job that manages bout lifecycle transitions:
 * - SCHEDULED → REGISTRATION (when registrationOpensAt passes)
 * - REGISTRATION → BETTING (when bettingOpensAt passes)
 * - BETTING → LIVE (when bettingClosesAt passes — generate puzzle, start clock)
 * - LIVE → RESOLVING (when solve duration expires — start reveal phase)
 * - RESOLVING → RESOLVED (after reveal window — calculate payouts)
 */

import cron from 'node-cron';
import prisma from '../db.js';
import config from '../config.js';
import { generatePuzzle, verifyCryptoPuzzle } from '../crypto-puzzles.js';
import { calculatePayouts } from '../bout-payout.js';
import sse from '../sse.js';
import logger from '../logger.js';

const REVEAL_WINDOW_SECS = 300; // 5 minutes to reveal after solve window

export function startBoutScheduler() {
    // Run every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
        try {
            await transitionBouts();
        } catch (err) {
            logger.error({ err }, 'Bout scheduler error');
        }
    });
    logger.info('Bout scheduler started (every 30s)');
}

async function transitionBouts() {
    const now = new Date();

    // ── SCHEDULED → REGISTRATION ───────────────────
    const toRegistration = await prisma.bout.findMany({
        where: { status: 'SCHEDULED', registrationOpensAt: { lte: now } },
    });
    for (const bout of toRegistration) {
        await prisma.bout.update({
            where: { id: bout.id },
            data: { status: 'REGISTRATION' },
        });
        logger.info({ boutId: bout.id, title: bout.title }, 'Bout → REGISTRATION');
        sse.broadcast('bout.registration', { boutId: bout.id, title: bout.title });
    }

    // ── REGISTRATION → BETTING ─────────────────────
    const toBetting = await prisma.bout.findMany({
        where: { status: 'REGISTRATION', bettingOpensAt: { lte: now } },
    });
    for (const bout of toBetting) {
        await prisma.bout.update({
            where: { id: bout.id },
            data: { status: 'BETTING' },
        });
        logger.info({ boutId: bout.id, title: bout.title }, 'Bout → BETTING');
        sse.broadcast('bout.betting', { boutId: bout.id, title: bout.title });
    }

    // ── BETTING → LIVE (generate puzzle, start clock) ──
    const toLive = await prisma.bout.findMany({
        where: { status: 'BETTING', bettingClosesAt: { lte: now } },
    });
    for (const bout of toLive) {
        // Generate the computational puzzle
        const generated = generatePuzzle(bout.puzzleType, bout.difficultyTier);

        await prisma.bout.update({
            where: { id: bout.id },
            data: {
                status: 'LIVE',
                liveAt: now,
                prompt: generated.prompt,
                challengeData: generated.challenge,
                answerHash: generated.answerHash,
            },
        });

        logger.info({ boutId: bout.id, title: bout.title, puzzleType: bout.puzzleType }, 'Bout → LIVE');
        sse.broadcast('bout.live', {
            boutId: bout.id,
            title: bout.title,
            puzzleType: bout.puzzleType,
            prompt: generated.prompt,
            challengeData: generated.challenge,
            solveDurationSecs: bout.solveDurationSecs,
        });
    }

    // ── LIVE → RESOLVING (solve window expired) ────
    const toResolving = await prisma.bout.findMany({
        where: { status: 'LIVE', liveAt: { not: null } },
    });
    for (const bout of toResolving) {
        const elapsed = Math.floor((now.getTime() - bout.liveAt.getTime()) / 1000);
        if (elapsed >= bout.solveDurationSecs) {
            await prisma.bout.update({
                where: { id: bout.id },
                data: { status: 'RESOLVING' },
            });
            logger.info({ boutId: bout.id }, 'Bout → RESOLVING (reveal window open)');
            sse.broadcast('bout.resolving', { boutId: bout.id, revealWindowSecs: REVEAL_WINDOW_SECS });
        }
    }

    // ── RESOLVING → RESOLVED (calculate payouts) ───
    const toResolved = await prisma.bout.findMany({
        where: { status: 'RESOLVING', liveAt: { not: null } },
        include: {
            entrants: true,
            bets: true,
        },
    });
    for (const bout of toResolved) {
        const elapsed = Math.floor((now.getTime() - bout.liveAt.getTime()) / 1000);
        const revealDeadline = bout.solveDurationSecs + REVEAL_WINDOW_SECS;

        // Check if all committed entrants have revealed, or reveal window expired
        const committed = bout.entrants.filter(e => e.commitHash);
        const allRevealed = committed.every(e => e.revealedAnswer);

        if (!allRevealed && elapsed < revealDeadline) continue; // still waiting

        // Calculate payouts
        const payouts = calculatePayouts({
            entrants: bout.entrants,
            bets: bout.bets,
            totalEntryFees: bout.totalEntryFees,
        });

        // Build transaction batch
        const ops = [];

        // Update bout
        ops.push(prisma.bout.update({
            where: { id: bout.id },
            data: {
                status: 'RESOLVED',
                resolvedAt: now,
                protocolRake: payouts.protocolRake,
                agentPurse: payouts.agentPurse,
                bettorPool: payouts.bettorPool,
            },
        }));

        // Agent placements and payouts
        for (const ap of payouts.agentPayouts) {
            const entrant = bout.entrants.find(e => e.id === ap.entrantId);
            ops.push(prisma.boutEntrant.update({
                where: { id: ap.entrantId },
                data: { placement: ap.placement, payout: ap.payout },
            }));
            if (ap.payout > 0 && entrant) {
                ops.push(prisma.wallet.update({
                    where: { id: entrant.walletId },
                    data: {
                        balance: { increment: ap.payout },
                        reputation: { increment: ap.placement <= 3 ? (4 - ap.placement) * 5 : 0 },
                    },
                }));
                ops.push(prisma.transaction.create({
                    data: {
                        toId: entrant.walletId,
                        amount: ap.payout,
                        type: 'BOUT_PURSE',
                        boutId: bout.id,
                        memo: `${ordinal(ap.placement)} place: ${bout.title}`,
                    },
                }));
            }
        }

        // Bettor payouts
        for (const bp of payouts.bettorPayouts) {
            if (bp.payout > 0) {
                ops.push(prisma.bet.update({
                    where: { id: bp.betId },
                    data: { payout: bp.payout },
                }));
                ops.push(prisma.wallet.update({
                    where: { id: bp.bettorId },
                    data: { balance: { increment: bp.payout } },
                }));
                ops.push(prisma.transaction.create({
                    data: {
                        toId: bp.bettorId,
                        amount: bp.payout,
                        type: 'BOUT_BET_WIN',
                        boutId: bout.id,
                        memo: `Bet payout: ${bout.title}`,
                    },
                }));
            }
        }
        // H-11 fix: Track losing bet amounts as redistribution, not burn.
        // These tokens were already deducted from bettors and placed in the pool.
        // They are redistributed to winners — NOT an additional burn event.
        if (payouts.losingBetBurn > 0) {
            ops.push(prisma.treasuryLedger.create({
                data: {
                    action: 'LOSING_BET_REDISTRIBUTION',
                    amount: payouts.losingBetBurn,
                    memo: `${payouts.losingBets.length} losing bet(s) redistributed to winners: ${bout.title}`,
                },
            }));
        }

        // Mark losing bets with 0 payout
        for (const lb of payouts.losingBets) {
            ops.push(prisma.bet.update({
                where: { id: lb.betId },
                data: { payout: 0 },
            }));
        }

        // Rake to vault stakers
        if (payouts.rakeToVault > 0) {
            ops.push(prisma.treasuryLedger.create({
                data: {
                    action: 'VAULT_RAKE_DEPOSIT',
                    amount: payouts.rakeToVault,
                    memo: `Vault staker share of rake: ${bout.title}`,
                },
            }));
        }

        await prisma.$transaction(ops);

        const podiumNames = payouts.podium.map(p => {
            const e = bout.entrants.find(en => en.id === p.entrantId);
            return e ? `#${p.placement}` : '?';
        });

        logger.info({
            boutId: bout.id,
            title: bout.title,
            podium: payouts.podium.length,
            agentPurse: payouts.agentPurse,
            bettorPool: payouts.bettorPool,
            rake: payouts.protocolRake,
        }, 'Bout → RESOLVED');

        sse.broadcast('bout.resolved', {
            boutId: bout.id,
            title: bout.title,
            podium: payouts.agentPayouts,
            totalBetPool: payouts.totalBetPool,
        });
    }
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
