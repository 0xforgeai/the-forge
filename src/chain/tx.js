/**
 * Chain Module — Transaction Layer
 *
 * Shared nonce-managed transaction sender with retry logic.
 * Replaces fire-and-forget with await-for-receipt pattern.
 *
 * Key behaviors:
 *   - Acquires lock (single tx at a time from deployer wallet)
 *   - Submits tx and waits for receipt (1 confirmation)
 *   - Retries on transient RPC errors (3 attempts, exponential backoff)
 *   - Throws on revert (caller handles)
 *   - Returns receipt with parsed events
 */

import logger from '../logger.js';

// ─── Transaction Lock ─────────────────────────────────────

let txInFlight = false;
const TX_LOCK_TIMEOUT_MS = 120_000; // 2 min safety timeout
let txLockTimer = null;

export function acquireTxLock() {
    if (txInFlight) return false;
    txInFlight = true;
    txLockTimer = setTimeout(() => {
        logger.warn('Tx lock held >2min — force-releasing (possible stuck tx)');
        txInFlight = false;
    }, TX_LOCK_TIMEOUT_MS);
    return true;
}

export function releaseTxLock() {
    txInFlight = false;
    if (txLockTimer) {
        clearTimeout(txLockTimer);
        txLockTimer = null;
    }
}

// ─── Custom Error ─────────────────────────────────────────

export class ChainRevertError extends Error {
    constructor(label, receipt) {
        super(`${label} tx mined but reverted (status=0): ${receipt.hash}`);
        this.name = 'ChainRevertError';
        this.receipt = receipt;
    }
}

export class TxLockBusyError extends Error {
    constructor(label) {
        super(`Tx lock busy — cannot submit ${label}`);
        this.name = 'TxLockBusyError';
    }
}

// ─── Submit Transaction ───────────────────────────────────

/**
 * Submit an on-chain transaction with retry and receipt validation.
 *
 * @param {Function} txFn - Async function that returns a tx response (e.g. () => contract.method(...args))
 * @param {string} label - Human-readable label for logging
 * @param {object} [opts] - Options
 * @param {number} [opts.confirmations=1] - Number of confirmations to wait for
 * @param {number} [opts.maxRetries=3] - Max retry attempts
 * @returns {import('ethers').TransactionReceipt} Confirmed receipt
 */
export async function submitTx(txFn, label, opts = {}) {
    const { confirmations = 1, maxRetries = 3 } = opts;

    if (!acquireTxLock()) {
        throw new TxLockBusyError(label);
    }

    let lastError;
    try {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const tx = await txFn();
                logger.info({ txHash: tx.hash, label }, `Tx submitted (attempt ${attempt})`);

                const receipt = await tx.wait(confirmations);
                if (!receipt.status) {
                    throw new ChainRevertError(label, receipt);
                }

                logger.info({
                    txHash: receipt.hash,
                    gasUsed: receipt.gasUsed?.toString(),
                    label,
                }, 'Tx confirmed');

                return receipt;
            } catch (err) {
                lastError = err;

                // Don't retry reverts — they're deterministic
                if (err instanceof ChainRevertError) throw err;

                const msg = err?.message || '';
                const isTransient = msg.includes('429') || msg.includes('TIMEOUT') ||
                    msg.includes('ECONNRESET') || msg.includes('NETWORK_ERROR') ||
                    msg.includes('SERVER_ERROR') || msg.includes('CALL_EXCEPTION');

                if (isTransient && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    logger.warn({ attempt, delay, label, error: msg.slice(0, 200) },
                        `Transient RPC error, retrying in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    } finally {
        releaseTxLock();
    }
}
