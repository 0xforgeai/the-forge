/**
 * Settlement Retry Job
 *
 * Processes PENDING on-chain settlement tasks (burns, transfers) that
 * failed or were queued because chain was unavailable.
 *
 * Runs every 5 minutes. Max 3 retries per task before marking FAILED.
 */

import cron from 'node-cron';
import prisma from '../db.js';
import logger from '../logger.js';
import {
    chainReady, forgeToken, acquireTxLock, releaseTxLock, sendTx,
} from '../chain.js';

const MAX_ATTEMPTS = 3;

async function processSettlementQueue() {
    if (!chainReady || !forgeToken) return;

    const tasks = await prisma.settlementTask.findMany({
        where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
        orderBy: { createdAt: 'asc' },
        take: 10,
    });

    if (tasks.length === 0) return;

    logger.info({ count: tasks.length }, 'Processing settlement queue');

    for (const task of tasks) {
        if (!acquireTxLock()) {
            logger.warn({ taskId: task.id }, 'Tx lock busy — will retry next tick');
            break;
        }

        try {
            let receipt;

            if (task.action === 'BURN') {
                receipt = await sendTx(
                    () => forgeToken.burn(task.amount),
                    `retry-burn-${task.id}`,
                );
            } else if (task.action === 'TRANSFER') {
                if (!task.toAddress) throw new Error('Missing toAddress for TRANSFER task');
                receipt = await sendTx(
                    () => forgeToken.transfer(task.toAddress, task.amount),
                    `retry-transfer-${task.id}`,
                );
            }

            await prisma.settlementTask.update({
                where: { id: task.id },
                data: {
                    status: 'CONFIRMED',
                    txHash: receipt.hash,
                    settledAt: new Date(),
                    attempts: { increment: 1 },
                },
            });

            logger.info({ taskId: task.id, txHash: receipt.hash, action: task.action }, 'Settlement task confirmed');
        } catch (err) {
            const newAttempts = task.attempts + 1;
            const isFinal = newAttempts >= MAX_ATTEMPTS;

            await prisma.settlementTask.update({
                where: { id: task.id },
                data: {
                    attempts: newAttempts,
                    lastError: err.message?.slice(0, 500),
                    status: isFinal ? 'FAILED' : 'PENDING',
                },
            });

            logger.error({
                taskId: task.id,
                attempt: newAttempts,
                final: isFinal,
                err: err.message,
            }, `Settlement task ${isFinal ? 'FAILED permanently' : 'will retry'}`);
        } finally {
            releaseTxLock();
        }
    }
}

export function startSettlementJob() {
    // Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            await processSettlementQueue();
        } catch (err) {
            logger.error({ err }, 'Settlement job error');
        }
    });

    logger.info('Settlement retry job started (every 5 min)');
}
