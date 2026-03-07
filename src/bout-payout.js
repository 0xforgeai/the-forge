/**
 * Bout Payout Engine
 *
 * Calculates payouts for a resolved bout:
 * - Protocol rake (5%)
 * - Agent purse (entry fees + 20% of bets)
 *   - Podium split (60/25/15) if 8+ entrants, winner-take-all if <8
 * - Bettor pool (75% of bets)
 *   - Parimutuel split among bettors who backed podium agents
 */

import config from './config.js';

const { protocolRakePercent, agentPursePercent, bettorPoolPercent, podiumSplit, podiumThreshold } = config.bout;

/**
 * Calculate all payouts for a resolved bout.
 *
 * @param {object} opts
 * @param {Array} opts.entrants - Ranked entrants [{ id, walletId, solved, solveTime }]
 * @param {Array} opts.bets - All bets [{ id, bettorId, entrantId, amount }]
 * @param {number} opts.totalEntryFees - Sum of all entry fees
 * @returns {{ protocolRake, agentPayouts, bettorPayouts, agentPurse, bettorPool }}
 */
export function calculatePayouts({ entrants, bets, totalEntryFees }) {
    const totalBetPool = bets.reduce((sum, b) => sum + b.amount, 0);

    // Protocol takes its cut from bets
    const protocolRake = Math.floor(totalBetPool * protocolRakePercent / 100);

    // Agent purse = entry fees + 20% of bet pool
    const agentPurseFromBets = Math.floor(totalBetPool * agentPursePercent / 100);
    const agentPurse = totalEntryFees + agentPurseFromBets;

    // Bettor pool = 75% of bet pool
    const bettorPool = Math.floor(totalBetPool * bettorPoolPercent / 100);

    // ─── Determine podium ──────────────────────────
    const solvers = entrants.filter(e => e.solved).sort((a, b) => a.solveTime - b.solveTime);
    const totalEntrants = entrants.length;
    const usePodium = totalEntrants >= podiumThreshold;

    let podium; // Array of { entrantId, placement, purseShare }
    if (solvers.length === 0) {
        // Nobody solved — no agent payouts
        podium = [];
    } else if (!usePodium || solvers.length === 1) {
        // Winner-take-all (< 8 entrants or only 1 solver)
        podium = [{ entrantId: solvers[0].id, placement: 1, purseShare: 100 }];
    } else if (solvers.length === 2) {
        // Only 1st and 2nd — 3rd's share goes to bettors
        podium = [
            { entrantId: solvers[0].id, placement: 1, purseShare: podiumSplit[0] + podiumSplit[2] }, // 60 + 15 = 75
            { entrantId: solvers[1].id, placement: 2, purseShare: podiumSplit[1] }, // 25
        ];
    } else {
        // Full podium
        podium = [
            { entrantId: solvers[0].id, placement: 1, purseShare: podiumSplit[0] },
            { entrantId: solvers[1].id, placement: 2, purseShare: podiumSplit[1] },
            { entrantId: solvers[2].id, placement: 3, purseShare: podiumSplit[2] },
        ];
    }

    // ─── Agent payouts ─────────────────────────────
    const agentPayouts = podium.map(p => ({
        entrantId: p.entrantId,
        placement: p.placement,
        payout: Math.floor(agentPurse * p.purseShare / 100),
    }));

    // ─── Bettor payouts (parimutuel) ───────────────
    const podiumEntrantIds = new Set(podium.map(p => p.entrantId));
    const winningBets = bets.filter(b => podiumEntrantIds.has(b.entrantId));
    const losingBets = bets.filter(b => !podiumEntrantIds.has(b.entrantId));

    let bettorPayouts = [];

    if (winningBets.length === 0 || solvers.length === 0) {
        // Nobody solved OR nobody bet on a winner → refund all bets
        // (bettorPool is returned to bettors proportionally)
        if (bets.length > 0) {
            bettorPayouts = bets.map(b => ({
                betId: b.id,
                bettorId: b.bettorId,
                payout: Math.floor(bettorPool * b.amount / totalBetPool),
            }));
        }
    } else {
        // Allocate bettor pool across placements based on share
        // Each placement gets a portion of the bettor pool
        const totalWinningBetAmount = winningBets.reduce((sum, b) => sum + b.amount, 0);

        bettorPayouts = winningBets.map(b => {
            // How much of the bettor pool does this bet earn?
            const share = b.amount / totalWinningBetAmount;
            const payout = Math.floor(bettorPool * share);
            return {
                betId: b.id,
                bettorId: b.bettorId,
                payout,
            };
        });
    }

    // ── Losing bet burn ─────────────────────────────
    const losingBetBurn = losingBets.reduce((sum, b) => sum + b.amount, 0);

    // ── Rounding dust: account for Math.floor truncation (C-6 fix) ──
    const allocatedFromBets = protocolRake + agentPurseFromBets + bettorPool;
    const roundingDust = totalBetPool - allocatedFromBets;

    // ── Vault split: 50% of rake to stakers ──────
    const rakeToVault = Math.floor(protocolRake / 2);
    const rakeToProtocol = protocolRake - rakeToVault;

    // ── Unallocated remainder (from nobody-solved edge case) ──
    let unallocated = 0;
    if (solvers.length === 0) {
        // Entry fees go to bettor refunds if nobody solved. If no bets either, protocol keeps it.
        unallocated = bets.length === 0 ? totalEntryFees : 0;
    }

    return {
        protocolRake: rakeToProtocol + unallocated + roundingDust,
        rakeToVault,
        agentPurse,
        bettorPool,
        totalBetPool,
        totalEntryFees,
        losingBetBurn,
        podium,
        agentPayouts,
        bettorPayouts,
        roundingDust,
        losingBets: losingBets.map(b => ({ betId: b.id, bettorId: b.bettorId, amount: b.amount })),
    };
}
