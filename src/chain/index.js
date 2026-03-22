/**
 * Chain Module — Index
 *
 * Initializes ethers.js provider, deployer wallet, and all contract instances.
 * Single source of truth for chain connectivity.
 *
 * Env vars required:
 *   PRIVATE_KEY   — deployer wallet private key
 *   BASE_RPC_URL  — Base mainnet RPC URL
 */

import { ethers } from 'ethers';
import config from '../config.js';
import logger from '../logger.js';

// ─── ABIs (human-readable — matches contract interfaces) ──

const FORGE_TOKEN_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function burn(uint256 amount)',
    'function burnFrom(address account, uint256 amount)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const FORGE_ARENA_ABI = [
    // Admin
    'function createBout(bytes32 boutId, uint256 entryFee, uint16 entryBurnBps, uint16 betBurnBps, uint16 protocolRakeBps, uint16 agentPurseBps, uint16 bettorPoolBps, uint8 maxEntrants)',
    'function setBoutLive(bytes32 boutId)',
    'function cancelBout(bytes32 boutId)',
    'function setVictoryEscrow(address _escrow)',
    // Direct
    'function enterBout(bytes32 boutId)',
    'function placeBet(bytes32 boutId, uint8 entrantIdx, uint256 amount)',
    'function resolveBout(bytes32 boutId, uint8[] placements)',
    'function claimPayout(bytes32 boutId)',
    'function claimBetPayout(bytes32 boutId)',
    // Relay
    'function enterBoutFor(bytes32 boutId, address agent)',
    'function placeBetFor(bytes32 boutId, address bettor, uint8 entrantIdx, uint256 amount)',
    'function resolveAndEscrow(bytes32 boutId, uint8[] placements)',
    // Views
    'function getBout(bytes32 boutId) view returns (tuple(bytes32 id, uint8 status, tuple(uint256 entryFee, uint16 entryBurnBps, uint16 betBurnBps, uint16 protocolRakeBps, uint16 agentPurseBps, uint16 bettorPoolBps, uint8 maxEntrants) config, uint256 totalEntryPool, uint256 totalBetPool, uint256 totalBurned, uint8 entrantCount, bool resolved))',
    'function getEntrants(bytes32 boutId) view returns (tuple(address wallet, uint256 feePaid, uint8 placement, uint256 payout, bool claimed)[])',
    'function getBets(bytes32 boutId) view returns (tuple(address bettor, uint8 entrantIdx, uint256 amount, uint256 payout, bool claimed)[])',
    'function totalBoutsCreated() view returns (uint256)',
    'function totalBurned() view returns (uint256)',
    // Events
    'event BoutCreated(bytes32 indexed boutId, uint256 entryFee, uint8 maxEntrants)',
    'event BoutEntered(bytes32 indexed boutId, address indexed agent, uint256 feePaid, uint256 burned)',
    'event BetPlaced(bytes32 indexed boutId, address indexed bettor, uint8 entrantIdx, uint256 amount, uint256 burned)',
    'event BoutResolved(bytes32 indexed boutId, uint256 agentPurse, uint256 bettorPool, uint256 rakeToVault, uint256 rakeToProtocol)',
    'event PayoutClaimed(bytes32 indexed boutId, address indexed claimant, uint256 amount)',
    'event BoutCancelled(bytes32 indexed boutId)',
];

const ARENA_VAULT_ABI = [
    'function depositYield(uint256 amount)',
    'function stake(uint256 amount, uint8 covenant)',
    'function unstake()',
    'function claimYield()',
    'function getPosition(address user) view returns (tuple(uint256 amount, uint256 unvestedRewards, uint256 vestedRewards, uint256 vestingStart, uint256 totalEarned, uint256 totalTaxPaid, uint256 stakedAt, uint256 lockExpiresAt, uint256 lastYieldClaim, uint256 rewardDebt, uint8 covenant, bool active))',
    'function totalStaked() view returns (uint256)',
    'function activeStakerCount() view returns (uint256)',
    'function rewardPerTokenStored() view returns (uint256)',
    'function getClaimable(address user) view returns (uint256)',
    'function getPendingYield(address user) view returns (uint256)',
    'function getRageQuitCost(address user) view returns (uint256 taxAmount, uint256 returnAmount)',
    // Events
    'event Staked(address indexed user, uint256 amount, uint8 covenant, uint256 lockExpires)',
    'event Unstaked(address indexed user, uint256 returned, uint256 taxed, uint256 forfeitedRewards)',
    'event YieldDeposited(uint256 amount, uint256 newRewardPerToken)',
    'event YieldClaimed(address indexed user, uint256 amount)',
];

const VICTORY_ESCROW_ABI = [
    'function lockPayout(bytes32 boutId, address winner, uint256 amount)',
    'function claimInstant(bytes32 boutId, uint256 escrowIdx)',
    'function claimInstantFor(bytes32 boutId, uint256 escrowIdx, address winner)',
    'function claimAsBond(bytes32 boutId, uint256 escrowIdx, uint16 discountBps, uint256 expiryTimestamp)',
    'function claimAsBondFor(bytes32 boutId, uint256 escrowIdx, address winner, uint16 discountBps, uint256 expiryTimestamp)',
    'function getEscrow(bytes32 boutId, uint256 escrowIdx) view returns (tuple(address winner, uint256 amount, bytes32 boutId, bool claimed))',
    'function getEscrowCount(bytes32 boutId) view returns (uint256)',
    'function getEscrows(bytes32 boutId) view returns (tuple(address winner, uint256 amount, bytes32 boutId, bool claimed)[])',
    // Events
    'event PayoutLocked(bytes32 indexed boutId, address indexed winner, uint256 amount, uint256 escrowIdx)',
    'event InstantClaimed(bytes32 indexed boutId, address indexed winner, uint256 netAmount, uint256 burned)',
    'event BondCreated(bytes32 indexed boutId, address indexed winner, uint256 bondId, uint256 amount)',
];

const FORGE_BONDS_ABI = [
    'function createBond(address creator, bytes32 boutId, uint256 faceValue, uint16 discountBps, uint256 expiresAt) returns (uint256 bondId)',
    'function buyBond(uint256 bondId, uint256 amount)',
    'function buyBondFor(uint256 bondId, uint256 amount, address buyer)',
    'function claimYield(uint256 bondId)',
    'function claimYieldFor(uint256 bondId, address creator)',
    'function expireBond(uint256 bondId)',
    'function fundYieldPool(uint256 amount)',
    'function getBond(uint256 bondId) view returns (tuple(address creator, bytes32 boutId, uint256 faceValue, uint256 remainingValue, uint16 discountBps, uint32 aprBps, uint256 accruedYield, uint256 lastYieldAt, uint256 createdAt, uint256 expiresAt, bool expired))',
    'function getActiveBonds() view returns (uint256[])',
    'function pendingYield(uint256 bondId) view returns (uint256)',
    'function getCurrentAprBps() view returns (uint32)',
    'function yieldPool() view returns (uint256)',
    // Events
    'event BondListed(uint256 indexed bondId, address indexed creator, bytes32 indexed boutId, uint256 faceValue, uint16 discountBps, uint32 aprBps, uint256 expiresAt)',
    'event BondPurchased(uint256 indexed bondId, address indexed buyer, uint256 amount, uint256 pricePaid)',
    'event YieldClaimed(uint256 indexed bondId, address indexed creator, uint256 amount)',
    'event BondExpired(uint256 indexed bondId, uint256 returnedToCreator, uint256 yieldPaid)',
    'event YieldPoolFunded(address indexed funder, uint256 amount)',
];

const FORGE_TREASURY_ABI = [
    'function emitTokens(address recipient, uint256 amount, string memo)',
    'function weeklyEmissionCap() view returns (uint256)',
    'function emittedThisWeek() view returns (uint256)',
    'function totalEmitted() view returns (uint256)',
    'function remainingThisWeek() view returns (uint256)',
    'function balance() view returns (uint256)',
    'function timeUntilWeekReset() view returns (uint256)',
    'function authorizedRecipients(address) view returns (bool)',
    'event Emitted(address indexed recipient, uint256 amount, string memo)',
];

// ─── Helpers ────────────────────────────────────────────────

/**
 * Convert UUID to bytes32 hex for Solidity.
 */
export function uuidToBytes32(uuid) {
    const hex = uuid.replace(/-/g, '');
    return '0x' + hex.padEnd(64, '0');
}

/**
 * Convert bytes32 hex back to UUID.
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
let victoryEscrow = null;
let forgeBonds = null;
let forgeTreasury = null;
let chainReady = false;

if (rpcUrl && privateKey) {
    try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        deployerWallet = new ethers.Wallet(privateKey, provider);

        forgeToken = new ethers.Contract(chainCfg.forgeTokenAddress, FORGE_TOKEN_ABI, deployerWallet);
        forgeArena = new ethers.Contract(chainCfg.forgeArenaAddress, FORGE_ARENA_ABI, deployerWallet);
        arenaVault = new ethers.Contract(chainCfg.arenaVaultAddress, ARENA_VAULT_ABI, deployerWallet);

        if (chainCfg.victoryEscrowAddress) {
            victoryEscrow = new ethers.Contract(chainCfg.victoryEscrowAddress, VICTORY_ESCROW_ABI, deployerWallet);
        }
        if (chainCfg.forgeBondsAddress) {
            forgeBonds = new ethers.Contract(chainCfg.forgeBondsAddress, FORGE_BONDS_ABI, deployerWallet);
        }
        if (chainCfg.forgeTreasuryAddress) {
            forgeTreasury = new ethers.Contract(chainCfg.forgeTreasuryAddress, FORGE_TREASURY_ABI, deployerWallet);
        }

        chainReady = true;
        logger.info({
            deployer: deployerWallet.address,
            forgeArena: chainCfg.forgeArenaAddress,
            arenaVault: chainCfg.arenaVaultAddress,
            victoryEscrow: chainCfg.victoryEscrowAddress || 'not set',
            forgeBonds: chainCfg.forgeBondsAddress || 'not set',
            forgeTreasury: chainCfg.forgeTreasuryAddress || 'not set',
        }, 'Chain module initialized — connected to Base');
    } catch (err) {
        logger.error({ err }, 'Failed to initialize chain module');
    }
} else {
    const missing = [];
    if (!rpcUrl) missing.push('BASE_RPC_URL');
    if (!privateKey) missing.push('PRIVATE_KEY');
    logger.warn({ missing }, 'Chain env vars missing — on-chain operations disabled');
}

export {
    provider,
    deployerWallet,
    forgeToken,
    forgeArena,
    arenaVault,
    victoryEscrow,
    forgeBonds,
    forgeTreasury,
    chainReady,
};
