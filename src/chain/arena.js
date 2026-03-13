/**
 * Chain Module — ForgeArena Interactions
 *
 * Chain-first wrappers for ForgeArena v2 contract calls.
 * Every function awaits on-chain confirmation before returning.
 */

import { forgeArena } from './index.js';
import { submitTx } from './tx.js';
import { uuidToBytes32 } from './index.js';
import logger from '../logger.js';

/**
 * Create a bout on-chain.
 */
export async function createBout(boutId, entryFee, config) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.createBout(
            id, entryFee,
            config.entryBurnBps, config.betBurnBps,
            config.protocolRakeBps, config.agentPurseBps,
            config.bettorPoolBps, config.maxEntrants,
        ),
        `createBout(${boutId})`,
    );
    logger.info({ boutId, txHash: receipt.hash }, 'Bout created on-chain');
    return receipt;
}

/**
 * Set a bout live on-chain.
 */
export async function setBoutLive(boutId) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.setBoutLive(id),
        `setBoutLive(${boutId})`,
    );
    return receipt;
}

/**
 * Cancel a bout on-chain (refunds entrants and bettors).
 */
export async function cancelBout(boutId) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.cancelBout(id),
        `cancelBout(${boutId})`,
    );
    return receipt;
}

/**
 * Relay: enter bout on behalf of an agent.
 * Agent must have approved ForgeArena for the entry fee.
 */
export async function enterBoutFor(boutId, agentAddress) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.enterBoutFor(id, agentAddress),
        `enterBoutFor(${boutId}, ${agentAddress})`,
    );
    return receipt;
}

/**
 * Relay: place bet on behalf of a bettor.
 * Bettor must have approved ForgeArena for the bet amount.
 */
export async function placeBetFor(boutId, bettorAddress, entrantIdx, amount) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.placeBetFor(id, bettorAddress, entrantIdx, amount),
        `placeBetFor(${boutId}, ${bettorAddress})`,
    );
    return receipt;
}

/**
 * Resolve and escrow: resolve bout with placements, route payouts to VictoryEscrow.
 */
export async function resolveAndEscrow(boutId, placements) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.resolveAndEscrow(id, placements),
        `resolveAndEscrow(${boutId})`,
    );
    return receipt;
}

/**
 * Legacy resolve (pull-claim pattern, kept for backward compat).
 */
export async function resolveBout(boutId, placements) {
    const id = uuidToBytes32(boutId);
    const receipt = await submitTx(
        () => forgeArena.resolveBout(id, placements),
        `resolveBout(${boutId})`,
    );
    return receipt;
}

// ─── Read-only ──────────────────────────────────────────────

export async function getBout(boutId) {
    const id = uuidToBytes32(boutId);
    return forgeArena.getBout(id);
}

export async function getEntrants(boutId) {
    const id = uuidToBytes32(boutId);
    return forgeArena.getEntrants(id);
}

export async function getBets(boutId) {
    const id = uuidToBytes32(boutId);
    return forgeArena.getBets(id);
}

export async function getTotalBoutsCreated() {
    return forgeArena.totalBoutsCreated();
}

export async function getTotalBurned() {
    return forgeArena.totalBurned();
}
