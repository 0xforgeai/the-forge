/**
 * Chain Module — Event Indexer
 *
 * Subscribes to contract events and syncs DB to match chain state.
 * Also handles catch-up sync on restart (replays events from last processed block).
 *
 * This is the ONLY path for DB writes on token-related data.
 * Pattern: API submits chain tx → waits for receipt → event handler updates DB.
 */

import { forgeArena, arenaVault, victoryEscrow, forgeBonds, forgeToken, provider, chainReady } from './index.js';
import { bytes32ToUuid } from './index.js';
import db from '../db.js';
import logger from '../logger.js';

let indexerRunning = false;

/**
 * Start the event indexer. Subscribes to all contract events.
 * Safe to call multiple times — will no-op if already running.
 */
export async function startEventIndexer() {
    if (!chainReady || indexerRunning) return;
    indexerRunning = true;

    logger.info('Starting event indexer...');

    try {
        // Catch up from last processed block
        await catchUpEvents();

        // Subscribe to live events
        subscribeToForgeArena();
        subscribeToVictoryEscrow();
        subscribeToForgeBonds();
        subscribeToArenaVault();
        subscribeToTransfers();

        logger.info('Event indexer running — subscribed to all contracts');
    } catch (err) {
        logger.error({ err }, 'Event indexer startup failed');
        indexerRunning = false;
    }
}

// ─── Catch-up from last processed block ─────────────────────

async function catchUpEvents() {
    const contracts = [
        { name: 'ForgeArena', contract: forgeArena },
        { name: 'VictoryEscrow', contract: victoryEscrow },
        { name: 'ForgeBonds', contract: forgeBonds },
        { name: 'ArenaVault', contract: arenaVault },
    ].filter(c => c.contract);

    for (const { name, contract } of contracts) {
        const address = contract.target;
        const cursor = await db.eventSyncCursor.findUnique({
            where: { contract: address },
        });
        const fromBlock = cursor ? Number(cursor.lastBlock) + 1 : 0;
        const currentBlock = await provider.getBlockNumber();

        if (fromBlock >= currentBlock) continue;

        logger.info({ contract: name, fromBlock, currentBlock }, 'Catching up events');

        // Query past events in chunks of 10,000 blocks
        const chunkSize = 10000;
        for (let start = fromBlock; start <= currentBlock; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, currentBlock);
            const events = await contract.queryFilter('*', start, end);
            for (const event of events) {
                await handleEvent(name, event);
            }
        }

        // Update cursor
        await db.eventSyncCursor.upsert({
            where: { contract: address },
            create: { contract: address, lastBlock: BigInt(currentBlock) },
            update: { lastBlock: BigInt(currentBlock) },
        });
    }
}

// ─── Live Event Subscriptions ───────────────────────────────

function subscribeToForgeArena() {
    if (!forgeArena) return;

    forgeArena.on('BoutCreated', async (boutId, entryFee, maxEntrants, event) => {
        await handleEvent('ForgeArena', event);
        await updateCursor(forgeArena.target, event.log.blockNumber);
    });

    forgeArena.on('BoutEntered', async (boutId, agent, feePaid, burned, event) => {
        await handleEvent('ForgeArena', event);
        await updateCursor(forgeArena.target, event.log.blockNumber);
    });

    forgeArena.on('BetPlaced', async (boutId, bettor, entrantIdx, amount, burned, event) => {
        await handleEvent('ForgeArena', event);
        await updateCursor(forgeArena.target, event.log.blockNumber);
    });

    forgeArena.on('BoutResolved', async (boutId, agentPurse, bettorPool, rakeToVault, rakeToProtocol, event) => {
        await handleEvent('ForgeArena', event);
        await updateCursor(forgeArena.target, event.log.blockNumber);
    });

    forgeArena.on('BoutCancelled', async (boutId, event) => {
        await handleEvent('ForgeArena', event);
        await updateCursor(forgeArena.target, event.log.blockNumber);
    });
}

function subscribeToVictoryEscrow() {
    if (!victoryEscrow) return;

    victoryEscrow.on('PayoutLocked', async (boutId, winner, amount, escrowIdx, event) => {
        await handleEvent('VictoryEscrow', event);
        await updateCursor(victoryEscrow.target, event.log.blockNumber);
    });

    victoryEscrow.on('InstantClaimed', async (boutId, winner, netAmount, burned, event) => {
        await handleEvent('VictoryEscrow', event);
        await updateCursor(victoryEscrow.target, event.log.blockNumber);
    });

    victoryEscrow.on('BondCreated', async (boutId, winner, bondId, amount, event) => {
        await handleEvent('VictoryEscrow', event);
        await updateCursor(victoryEscrow.target, event.log.blockNumber);
    });
}

function subscribeToForgeBonds() {
    if (!forgeBonds) return;

    forgeBonds.on('BondListed', async (bondId, creator, boutId, faceValue, discountBps, aprBps, expiresAt, event) => {
        await handleEvent('ForgeBonds', event);
        await updateCursor(forgeBonds.target, event.log.blockNumber);
    });

    forgeBonds.on('BondPurchased', async (bondId, buyer, amount, pricePaid, event) => {
        await handleEvent('ForgeBonds', event);
        await updateCursor(forgeBonds.target, event.log.blockNumber);
    });

    forgeBonds.on('YieldClaimed', async (bondId, creator, amount, event) => {
        await handleEvent('ForgeBonds', event);
        await updateCursor(forgeBonds.target, event.log.blockNumber);
    });

    forgeBonds.on('BondExpired', async (bondId, returnedToCreator, yieldPaid, event) => {
        await handleEvent('ForgeBonds', event);
        await updateCursor(forgeBonds.target, event.log.blockNumber);
    });
}

function subscribeToArenaVault() {
    if (!arenaVault) return;

    arenaVault.on('Staked', async (user, amount, covenant, lockExpires, event) => {
        await handleEvent('ArenaVault', event);
        await updateCursor(arenaVault.target, event.log.blockNumber);
    });

    arenaVault.on('Unstaked', async (user, returned, taxed, forfeitedRewards, event) => {
        await handleEvent('ArenaVault', event);
        await updateCursor(arenaVault.target, event.log.blockNumber);
    });

    arenaVault.on('YieldDeposited', async (amount, newRewardPerToken, event) => {
        await handleEvent('ArenaVault', event);
        await updateCursor(arenaVault.target, event.log.blockNumber);
    });
}

function subscribeToTransfers() {
    if (!forgeToken) return;

    forgeToken.on('Transfer', async (from, to, value, event) => {
        // Update balance cache for both addresses
        try {
            const block = event.log.blockNumber;
            if (from !== '0x0000000000000000000000000000000000000000') {
                const fromBal = await forgeToken.balanceOf(from);
                await db.balanceCache.upsert({
                    where: { address: from },
                    create: { address: from, balance: fromBal, lastBlock: BigInt(block) },
                    update: { balance: fromBal, lastBlock: BigInt(block) },
                });
            }
            if (to !== '0x0000000000000000000000000000000000000000') {
                const toBal = await forgeToken.balanceOf(to);
                await db.balanceCache.upsert({
                    where: { address: to },
                    create: { address: to, balance: toBal, lastBlock: BigInt(block) },
                    update: { balance: toBal, lastBlock: BigInt(block) },
                });
            }
        } catch (err) {
            logger.error({ err }, 'Failed to update balance cache from Transfer event');
        }
    });
}

// ─── Event Handlers ─────────────────────────────────────────

async function handleEvent(contractName, event) {
    // Generic event logger — specific DB updates happen in route handlers
    // after they receive receipts. This is the catch-up/redundancy path.
    const eventName = event.fragment?.name || event.eventName || 'Unknown';
    logger.debug({
        contract: contractName,
        event: eventName,
        block: event.log?.blockNumber,
        txHash: event.log?.transactionHash,
    }, `Event: ${contractName}.${eventName}`);

    // ── Vault: Staked event → upsert DB stakePosition ──
    if (contractName === 'ArenaVault' && eventName === 'Staked') {
        try {
            const [user, amountWei, covenantIdx, lockExpires] = event.args || [];
            const covenantNames = ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'];
            const covenant = covenantNames[Number(covenantIdx)] || 'FLAME';
            const amount = Number(amountWei / 10n ** 18n); // wei → whole tokens
            const lockExpiresAt = new Date(Number(lockExpires) * 1000);

            // Find wallet by address (case-insensitive)
            const wallet = await db.wallet.findFirst({
                where: { address: { equals: user, mode: 'insensitive' } },
            });

            if (!wallet) {
                logger.warn({ user, amount, covenant }, 'Staked event: no wallet found for address');
                return;
            }

            const covConfig = {
                FLAME: { lockDays: 1, apyBonus: 0, rageQuitMulti: 1.0 },
                STEEL: { lockDays: 3, apyBonus: 50, rageQuitMulti: 2.0 },
                OBSIDIAN: { lockDays: 7, apyBonus: 150, rageQuitMulti: 3.0 },
                ETERNAL: { lockDays: 30, apyBonus: 300, rageQuitMulti: 999 },
            }[covenant];

            // Check if this wallet already has an active position
            const existing = await db.stakePosition.findFirst({
                where: { walletId: wallet.id, active: true },
            });

            if (existing) {
                // Update amount if changed
                if (Number(existing.amount) !== amount) {
                    await db.stakePosition.update({
                        where: { id: existing.id },
                        data: { amount },
                    });
                    logger.info({ agent: wallet.name, amount, covenant }, 'Staked event: updated existing position');
                }
            } else {
                await db.stakePosition.create({
                    data: {
                        walletId: wallet.id,
                        amount,
                        covenant,
                        lockDays: covConfig.lockDays,
                        apyBonus: covConfig.apyBonus,
                        rageQuitMulti: covConfig.rageQuitMulti,
                        lockExpiresAt,
                        loyaltyMulti: 1.0,
                        loyaltyWeek: 0,
                    },
                });
                logger.info({ agent: wallet.name, amount, covenant, lockExpiresAt }, 'Staked event: created DB position from chain');
            }
        } catch (err) {
            logger.error({ err }, 'Failed to handle Staked event');
        }
    }

    // ── Vault: Unstaked event → deactivate DB stakePosition ──
    if (contractName === 'ArenaVault' && eventName === 'Unstaked') {
        try {
            const [user, returnedWei, taxedWei, forfeitedWei] = event.args || [];

            const wallet = await db.wallet.findFirst({
                where: { address: { equals: user, mode: 'insensitive' } },
            });

            if (!wallet) return;

            const active = await db.stakePosition.findFirst({
                where: { walletId: wallet.id, active: true },
            });

            if (active) {
                const taxed = Number(taxedWei / 10n ** 18n);
                await db.stakePosition.update({
                    where: { id: active.id },
                    data: {
                        active: false,
                        unstakedAt: new Date(),
                        totalTaxPaid: BigInt(taxed),
                    },
                });
                logger.info({ agent: wallet.name, returned: Number(returnedWei / 10n ** 18n), taxed }, 'Unstaked event: deactivated DB position');
            }
        } catch (err) {
            logger.error({ err }, 'Failed to handle Unstaked event');
        }
    }
}

async function updateCursor(address, blockNumber) {
    try {
        await db.eventSyncCursor.upsert({
            where: { contract: address },
            create: { contract: address, lastBlock: BigInt(blockNumber) },
            update: { lastBlock: BigInt(blockNumber) },
        });
    } catch (err) {
        logger.error({ err, address, blockNumber }, 'Failed to update event sync cursor');
    }
}

export default { startEventIndexer };
