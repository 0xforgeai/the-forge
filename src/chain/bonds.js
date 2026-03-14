/**
 * Chain Module — ForgeBonds Interactions
 *
 * Chain-first wrappers for ForgeBonds contract calls.
 * Handles bond purchases, yield claims, expiry, and yield pool funding.
 */

import { forgeBonds, forgeToken } from './index.js';
import { submitTx } from './tx.js';
import logger from '../logger.js';

/**
 * Relay: buy a bond (full or partial) on behalf of a buyer.
 * Buyer must have approved ForgeBonds for the discounted price.
 */
export async function buyBondFor(bondId, amount, buyerAddress) {
    const receipt = await submitTx(
        () => forgeBonds.buyBondFor(bondId, amount, buyerAddress),
        `buyBondFor(${bondId}, ${buyerAddress})`,
    );
    logger.info({ bondId, amount: amount.toString(), buyerAddress, txHash: receipt.hash }, 'Bond purchase relayed');
    return receipt;
}

/**
 * Relay: claim accrued yield on behalf of bond creator.
 */
export async function claimYieldFor(bondId, creatorAddress) {
    const receipt = await submitTx(
        () => forgeBonds.claimYieldFor(bondId, creatorAddress),
        `claimYieldFor(${bondId}, ${creatorAddress})`,
    );
    return receipt;
}

/**
 * Expire a bond past its expiry. Returns remaining + yield to creator.
 * Anyone can call this — backend acts as a public service.
 */
export async function expireBond(bondId) {
    const receipt = await submitTx(
        () => forgeBonds.expireBond(bondId),
        `expireBond(${bondId})`,
    );
    logger.info({ bondId, txHash: receipt.hash }, 'Bond expired on-chain');
    return receipt;
}

/**
 * Fund the yield pool (from treasury emissions or rake).
 * Deployer must have approved ForgeBonds for the amount.
 */
export async function fundYieldPool(amount) {
    // Approve first
    await submitTx(
        () => forgeToken.approve(forgeBonds.target, amount),
        `approve-forgeBonds-yieldPool(${amount})`,
    );
    const receipt = await submitTx(
        () => forgeBonds.fundYieldPool(amount),
        `fundYieldPool(${amount})`,
    );
    logger.info({ amount: amount.toString(), txHash: receipt.hash }, 'Yield pool funded');
    return receipt;
}

// ─── Read-only ──────────────────────────────────────────────

export async function getBond(bondId) {
    return forgeBonds.getBond(bondId);
}

export async function pendingYield(bondId) {
    return forgeBonds.pendingYield(bondId);
}

export async function getActiveBonds() {
    return forgeBonds.getActiveBonds();
}

export async function getCurrentAprBps() {
    return forgeBonds.getCurrentAprBps();
}

export async function getYieldPool() {
    return forgeBonds.yieldPool();
}
