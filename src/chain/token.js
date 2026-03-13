/**
 * Chain Module — ForgeToken Read-Only
 *
 * On-chain balance and supply reads.
 * These replace DB balance lookups — chain is source of truth.
 */

import { forgeToken } from './index.js';

/**
 * Get the FORGE balance of an address.
 * This replaces wallet.balance from DB.
 */
export async function balanceOf(address) {
    return forgeToken.balanceOf(address);
}

/**
 * Get total FORGE supply (decreases with burns).
 */
export async function totalSupply() {
    return forgeToken.totalSupply();
}

/**
 * Check allowance: how much `spender` can spend from `owner`.
 */
export async function allowance(ownerAddress, spenderAddress) {
    return forgeToken.allowance(ownerAddress, spenderAddress);
}
