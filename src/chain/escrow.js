/**
 * Chain Module — VictoryEscrow Interactions
 *
 * Chain-first wrappers for VictoryEscrow contract calls.
 */

import { victoryEscrow } from './index.js';
import { submitTx } from './tx.js';
import { uuidToBytes32 } from './index.js';
import logger from '../logger.js';

/**
 * Relay: claim instant payout on behalf of a winner.
 * Burns instantBurnBps%, transfers the rest to winner.
 */
export async function claimInstantFor(boutId, escrowIdx, winnerAddress) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => victoryEscrow.claimInstantFor(id, escrowIdx, winnerAddress),
        `claimInstantFor(${boutId}, idx=${escrowIdx}, ${winnerAddress})`,
    );
    logger.info({ boutId, escrowIdx, winnerAddress, txHash: receipt.hash }, 'Instant claim relayed');
    return receipt;
}

/**
 * Relay: create OTC bond from winner's payout.
 */
export async function claimAsBondFor(boutId, escrowIdx, winnerAddress, discountBps, expiryTimestamp) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => victoryEscrow.claimAsBondFor(id, escrowIdx, winnerAddress, discountBps, expiryTimestamp),
        `claimAsBondFor(${boutId}, idx=${escrowIdx}, ${winnerAddress})`,
    );
    logger.info({ boutId, escrowIdx, winnerAddress, txHash: receipt.hash }, 'Bond creation relayed');
    return receipt;
}

// ─── Read-only ──────────────────────────────────────────────

export async function getEscrow(boutId, escrowIdx) {
    const id = uuidToBytes32(boutId);
    return victoryEscrow.getEscrow(id, escrowIdx);
}

export async function getEscrowCount(boutId) {
    const id = uuidToBytes32(boutId);
    return victoryEscrow.getEscrowCount(id);
}

export async function getEscrows(boutId) {
    const id = uuidToBytes32(boutId);
    return victoryEscrow.getEscrows(id);
}
