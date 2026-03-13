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

export { provider, deployerWallet, forgeToken, forgeArena, arenaVault, chainReady };
