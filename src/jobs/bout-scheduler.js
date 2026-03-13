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
import { ethers } from 'ethers';
import prisma from '../db.js';
import config from '../config.js';
import { generatePuzzle, verifyCryptoPuzzle } from '../crypto-puzzles.js';
import { calculatePayouts } from '../bout-payout.js';
import { forgeArena, chainReady, uuidToBytes32, acquireTxLock, releaseTxLock, sendTx } from '../chain.js';
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

        // ── On-chain: create bout + set live on ForgeArena ──
        const boutBytes32 = uuidToBytes32(bout.id);
        let onChainCreated = false;
        if (chainReady && forgeArena) {
            // Acquire tx lock to prevent concurrent on-chain txs
            if (!acquireTxLock()) {
                logger.warn({ boutId: bout.id }, 'Tx lock busy — skipping on-chain createBout this tick');
            } else {
                try {
                    // Idempotency check: verify bout doesn't already exist on-chain
                    const existing = await forgeArena.getBout(boutBytes32);
                    if (existing.status !== 0n) {
                        logger.info({ boutId: bout.id }, 'Bout already exists on-chain — skipping createBout');
                        onChainCreated = true;
                    } else {
                        const cc = config.chain;
                        const entryFeeWei = ethers.parseEther(bout.entryFee.toString());

                        const createReceipt = await sendTx(
                            () => forgeArena.createBout(
                                boutBytes32, entryFeeWei,
                                cc.entryBurnBps, cc.betBurnBps, cc.protocolRakeBps,
                                cc.agentPurseBps, cc.bettorPoolBps, cc.maxEntrants,
                            ),
                            'createBout',
                        );
                        logger.info({ boutId: bout.id, txHash: createReceipt.hash }, 'On-chain: createBout() confirmed');

                        const liveReceipt = await sendTx(
                            () => forgeArena.setBoutLive(boutBytes32),
                            'setBoutLive',
                        );
                        logger.info({ boutId: bout.id, txHash: liveReceipt.hash }, 'On-chain: setBoutLive() confirmed');

                        onChainCreated = true;
                    }
                } catch (err) {
                    logger.error({ err, boutId: bout.id }, 'On-chain createBout/setBoutLive failed — proceeding with DB only');
                } finally {
                    releaseTxLock();
                }
            }
        }

        await prisma.bout.update({
            where: { id: bout.id },
            data: {
                status: 'LIVE',
                liveAt: now,
                prompt: generated.prompt,
                challengeData: generated.challenge,
                answerHash: generated.answerHash,
                onChainBoutId: boutBytes32,
                onChainCreated,
            },
        });

        logger.info({ boutId: bout.id, title: bout.title, puzzleType: bout.puzzleType, onChainCreated }, 'Bout → LIVE');
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

        // Agent placements — record payout amounts but do NOT credit wallets (escrow pattern).
        // Winners must claim via POST /api/bouts/:id/claim to choose their payout path.
        for (const ap of payouts.agentPayouts) {
            ops.push(prisma.boutEntrant.update({
                where: { id: ap.entrantId },
                data: { placement: ap.placement, payout: ap.payout },
            }));
            // Reputation is immediate (not escrowed)
            if (ap.payout > 0) {
                const entrant = bout.entrants.find(e => e.id === ap.entrantId);
                if (entrant && ap.placement <= 3) {
                    ops.push(prisma.wallet.update({
                        where: { id: entrant.walletId },
                        data: {
                            reputation: { increment: (4 - ap.placement) * 5 },
                        },
                    }));
                }
                // Record escrow transaction (tokens held, not yet credited)
                if (entrant) {
                    ops.push(prisma.transaction.create({
                        data: {
                            toId: entrant.walletId,
                            amount: ap.payout,
                            type: 'VICTORY_ESCROW',
                            boutId: bout.id,
                            memo: `${ordinal(ap.placement)} place (escrowed): ${bout.title}`,
                        },
                    }));
                }
            }
        }

        // Bettor payouts — record amounts but do NOT credit wallets (escrow pattern).
        for (const bp of payouts.bettorPayouts) {
            if (bp.payout > 0) {
                ops.push(prisma.bet.update({
                    where: { id: bp.betId },
                    data: { payout: bp.payout },
                }));
                ops.push(prisma.transaction.create({
                    data: {
                        toId: bp.bettorId,
                        amount: bp.payout,
                        type: 'VICTORY_ESCROW',
                        boutId: bout.id,
                        memo: `Bet win (escrowed): ${bout.title}`,
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

        // ── On-chain: resolveBout on ForgeArena ──
        // In hybrid mode, no agents entered on-chain (enterBout() is not called).
        // The on-chain boutEntrants array is empty, so resolveBout() with any
        // placement indices would revert ("Invalid placement idx").
        // Only call resolveBout on-chain with empty placements (triggers no-solver path
        // which adds agentPurse to protocolRake — acceptable for hybrid accounting).
        if (chainReady && forgeArena && bout.onChainCreated) {
            if (!acquireTxLock()) {
                logger.warn({ boutId: bout.id }, 'Tx lock busy — skipping on-chain resolveBout this tick');
            } else {
                try {
                    const boutBytes32 = bout.onChainBoutId || uuidToBytes32(bout.id);

                    // Pass empty placements — no on-chain entrants in hybrid mode
                    const resolveReceipt = await sendTx(
                        () => forgeArena.resolveBout(boutBytes32, []),
                        'resolveBout',
                    );
                    logger.info({ boutId: bout.id, txHash: resolveReceipt.hash }, 'On-chain: resolveBout() confirmed (hybrid — empty placements)');

                    await prisma.treasuryLedger.create({
                        data: {
                            action: 'ON_CHAIN_RESOLVE',
                            amount: 0,
                            memo: `resolveBout tx: ${resolveReceipt.hash} — hybrid mode (empty placements)`,
                        },
                    });
                } catch (err) {
                    logger.error({ err, boutId: bout.id }, 'On-chain resolveBout failed — DB resolution still applied');
                } finally {
                    releaseTxLock();
                }
            }
        }

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
