/**
 * Chain Module — ArenaVault Interactions
 *
 * Chain-first wrappers for ArenaVault contract calls.
 * Vault staking is already fully on-chain — these are thin wrappers.
 */

import { arenaVault, forgeToken } from './index.js';
import { submitTx } from './tx.js';
import logger from '../logger.js';

/**
 * Deposit yield into the vault (from bout rake or bootstrap emissions).
 * Deployer must have approved ArenaVault for the amount.
 */
export async function depositYield(amount) {
    // Approve first
    await submitTx(
        () => forgeToken.approve(arenaVault.target, amount),
        `approve-arenaVault-yield(${amount})`,
    );
    const receipt = await submitTx(
        () => arenaVault.depositYield(amount),
        `depositYield(${amount})`,
    );
    logger.info({ amount: amount.toString(), txHash: receipt.hash }, 'Yield deposited to vault');
    return receipt;
}

// ─── Read-only ──────────────────────────────────────────────

export async function getPosition(userAddress) {
    return arenaVault.getPosition(userAddress);
}

export async function totalStaked() {
    return arenaVault.totalStaked();
}

export async function activeStakerCount() {
    return arenaVault.activeStakerCount();
}

export async function getClaimable(userAddress) {
    return arenaVault.getClaimable(userAddress);
}

export async function getPendingYield(userAddress) {
    return arenaVault.getPendingYield(userAddress);
}

export async function getRageQuitCost(userAddress) {
    return arenaVault.getRageQuitCost(userAddress);
}
