/**
 * On-Chain Provider Module
 *
 * Initializes ethers.js with the deployer wallet and exposes contract instances
 * for ForgeArena and ArenaVault on Base mainnet.
 *
 * Env vars required:
 *   PRIVATE_KEY   — deployer wallet private key
 *   BASE_RPC_URL  — Alchemy Base mainnet RPC URL
 *
 * If env vars are missing, exports null contracts so the server still starts.
 */

import { ethers } from 'ethers';
import config from './config.js';
import logger from './logger.js';

// ─── ABIs (minimal — only the functions we call from backend) ──

const FORGE_TOKEN_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function burn(uint256 amount)',
    'function transfer(address to, uint256 amount) returns (bool)',
];

const FORGE_ARENA_ABI = [
    'function createBout(bytes32 boutId, uint256 entryFee, uint16 entryBurnBps, uint16 betBurnBps, uint16 protocolRakeBps, uint16 agentPurseBps, uint16 bettorPoolBps, uint8 maxEntrants)',
    'function setBoutLive(bytes32 boutId)',
    'function resolveBout(bytes32 boutId, uint8[] placements)',
    'function cancelBout(bytes32 boutId)',
    'function getBout(bytes32 boutId) view returns (tuple(bytes32 id, uint8 status, tuple(uint256 entryFee, uint16 entryBurnBps, uint16 betBurnBps, uint16 protocolRakeBps, uint16 agentPurseBps, uint16 bettorPoolBps, uint8 maxEntrants) config, uint256 totalEntryPool, uint256 totalBetPool, uint256 totalBurned, uint8 entrantCount, bool resolved))',
    'function getEntrants(bytes32 boutId) view returns (tuple(address wallet, uint256 feePaid, uint8 placement, uint256 payout, bool claimed)[])',
    'function totalBoutsCreated() view returns (uint256)',
    'function totalBurned() view returns (uint256)',
];

const ARENA_VAULT_ABI = [
    'function depositYield(uint256 amount)',
    'function totalStaked() view returns (uint256)',
    'function activeStakerCount() view returns (uint256)',
    'function rewardPerTokenStored() view returns (uint256)',
];

// ─── Helpers ────────────────────────────────────────────────

/**
 * Convert a UUID string to a bytes32 hex string for Solidity.
 * Strips dashes and left-pads to 32 bytes.
 * e.g. "550e8400-e29b-41d4-a716-446655440000" → "0x550e8400e29b41d4a716446655440000..."
 */
export function uuidToBytes32(uuid) {
    const hex = uuid.replace(/-/g, '');
    // UUID is 16 bytes (32 hex chars), pad to 32 bytes (64 hex chars)
    return '0x' + hex.padEnd(64, '0');
}

/**
 * Convert a bytes32 hex back to a UUID string.
 */
export function bytes32ToUuid(bytes32) {
    const hex = bytes32.replace('0x', '').slice(0, 32);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

// ─── Transaction Lock (prevents concurrent on-chain txs) ──

let txInFlight = false;
const TX_LOCK_TIMEOUT_MS = 120_000; // 2 min safety timeout
let txLockTimer = null;

/**
 * Acquire the transaction lock. Returns true if acquired, false if busy.
 */
export function acquireTxLock() {
    if (txInFlight) return false;
    txInFlight = true;
    txLockTimer = setTimeout(() => {
        logger.warn('Tx lock held >2min — force-releasing (possible stuck tx)');
        txInFlight = false;
    }, TX_LOCK_TIMEOUT_MS);
    return true;
}

/**
 * Release the transaction lock.
 */
export function releaseTxLock() {
    txInFlight = false;
    if (txLockTimer) {
        clearTimeout(txLockTimer);
        txLockTimer = null;
    }
}

/**
 * Send a transaction with retry on transient RPC errors and receipt status check.
 * @param {Function} txFn - async function that returns a tx response
 * @param {string} label - human-readable label for logging
 * @param {number} maxRetries - max retry attempts (default 3)
 * @returns {import('ethers').TransactionReceipt} confirmed receipt
 */
export async function sendTx(txFn, label, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const tx = await txFn();
            const receipt = await tx.wait();
            if (receipt.status !== 1) {
                throw new Error(`${label} tx mined but reverted (status=0): ${receipt.hash}`);
            }
            return receipt;
        } catch (err) {
            lastError = err;
            const msg = err?.message || '';
            const isTransient = msg.includes('429') || msg.includes('TIMEOUT') ||
                msg.includes('ECONNRESET') || msg.includes('NETWORK_ERROR') ||
                msg.includes('SERVER_ERROR');
            if (isTransient && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn({ attempt, delay, label }, `Transient RPC error, retrying in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

// ─── Initialize ─────────────────────────────────────────────

const { chain: chainCfg } = config;
const rpcUrl = chainCfg.rpcUrl;
const privateKey = process.env.PRIVATE_KEY || '';

let provider = null;
let deployerWallet = null;
let forgeToken = null;
let forgeArena = null;
let arenaVault = null;
let chainReady = false;

if (rpcUrl && privateKey) {
    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        deployerWallet = new ethers.Wallet(privateKey, provider);

        forgeToken = new ethers.Contract(chainCfg.forgeTokenAddress, FORGE_TOKEN_ABI, deployerWallet);
        forgeArena = new ethers.Contract(chainCfg.forgeArenaAddress, FORGE_ARENA_ABI, deployerWallet);
        arenaVault = new ethers.Contract(chainCfg.arenaVaultAddress, ARENA_VAULT_ABI, deployerWallet);

        chainReady = true;
        logger.info({
            deployer: deployerWallet.address,
            forgeArena: chainCfg.forgeArenaAddress,
            arenaVault: chainCfg.arenaVaultAddress,
        }, 'Connected to Base mainnet');
    } catch (err) {
        logger.error({ err }, 'Failed to initialize chain provider');
    }
} else {
    const missing = [];
    if (!rpcUrl) missing.push('BASE_RPC_URL');
    if (!privateKey) missing.push('PRIVATE_KEY');
    logger.warn({ missing }, 'Chain env vars missing — on-chain relay disabled. Set BASE_RPC_URL and PRIVATE_KEY to enable.');
}

// ─── Settlement Helpers ──────────────────────────────────

/**
 * Burn FORGE tokens from the hot wallet on-chain.
 * DB commit happens first; this is fire-and-settle.
 * On failure, queues a SettlementTask for retry.
 *
 * @param {BigInt} amount - wei amount to burn
 * @param {string} refType - reference type for tracing (e.g. 'VICTORY_CLAIM')
 * @param {string} refId - reference ID for tracing
 * @param {import('@prisma/client').PrismaClient} db - prisma instance
 */
export async function settleBurn(amount, refType, refId, db) {
    if (!chainReady || !forgeToken) {
        logger.warn({ amount, refType, refId }, 'Chain not ready — queuing burn settlement');
        await db.settlementTask.create({
            data: { action: 'BURN', amount, refType, refId },
        });
        return;
    }

    if (!acquireTxLock()) {
        logger.warn({ refType, refId }, 'Tx lock busy — queuing burn settlement');
        await db.settlementTask.create({
            data: { action: 'BURN', amount, refType, refId },
        });
        return;
    }

    try {
        const receipt = await sendTx(
            () => forgeToken.burn(amount),
            `burn-${refType}`,
        );
        logger.info({ txHash: receipt.hash, amount, refType, refId }, 'On-chain burn confirmed');

        await db.settlementTask.create({
            data: { action: 'BURN', amount, refType, refId, txHash: receipt.hash, status: 'CONFIRMED', settledAt: new Date() },
        });
    } catch (err) {
        logger.error({ err, amount, refType, refId }, 'On-chain burn failed — queued for retry');
        await db.settlementTask.create({
            data: { action: 'BURN', amount, refType, refId, attempts: 1, lastError: err.message?.slice(0, 500) },
        });
    } finally {
        releaseTxLock();
    }
}

/**
 * Transfer FORGE tokens from hot wallet to an on-chain address.
 * Used when users withdraw or when bond expiry returns tokens.
 *
 * @param {string} toAddress - recipient on-chain address
 * @param {BigInt} amount - wei amount to transfer
 * @param {string} refType - reference type for tracing
 * @param {string} refId - reference ID for tracing
 * @param {import('@prisma/client').PrismaClient} db - prisma instance
 */
export async function settleTransfer(toAddress, amount, refType, refId, db) {
    if (!chainReady || !forgeToken) {
        logger.warn({ amount, toAddress, refType, refId }, 'Chain not ready — queuing transfer settlement');
        await db.settlementTask.create({
            data: { action: 'TRANSFER', amount, toAddress, refType, refId },
        });
        return;
    }

    if (!acquireTxLock()) {
        logger.warn({ refType, refId }, 'Tx lock busy — queuing transfer settlement');
        await db.settlementTask.create({
            data: { action: 'TRANSFER', amount, toAddress, refType, refId },
        });
        return;
    }

    try {
        const receipt = await sendTx(
            () => forgeToken.transfer(toAddress, amount),
            `transfer-${refType}`,
        );
        logger.info({ txHash: receipt.hash, amount, toAddress, refType, refId }, 'On-chain transfer confirmed');

        await db.settlementTask.create({
            data: { action: 'TRANSFER', amount, toAddress, refType, refId, txHash: receipt.hash, status: 'CONFIRMED', settledAt: new Date() },
        });
    } catch (err) {
        logger.error({ err, amount, toAddress, refType, refId }, 'On-chain transfer failed — queued for retry');
        await db.settlementTask.create({
            data: { action: 'TRANSFER', amount, toAddress, refType, refId, attempts: 1, lastError: err.message?.slice(0, 500) },
        });
    } finally {
        releaseTxLock();
    }
}

export { provider, deployerWallet, forgeToken, forgeArena, arenaVault, chainReady };
