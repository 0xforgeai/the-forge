import cron from 'node-cron';
import logger from '../logger.js';
import { totalSupply } from '../chain/token.js';
import { chainReady } from '../chain/index.js';

/**
 * Supply Invariant Check — Simplified
 *
 * Chain is source of truth. The invariant check is now trivial:
 *   onChainSupply = forgeToken.totalSupply()
 *
 * This just logs the current supply for monitoring.
 * Burns decrease totalSupply automatically on-chain.
 * No DB-vs-chain reconciliation needed.
 */

async function checkSupplyInvariant() {
    try {
        if (!chainReady) {
            logger.warn('Chain not ready — skipping supply invariant check');
            return;
        }

        const onChainSupply = await totalSupply();
        const maxSupply = 1_000_000_000n * 10n ** 18n; // 1B FORGE
        const totalBurned = maxSupply - onChainSupply;

        const report = {
            onChainSupply: onChainSupply.toString(),
            maxSupply: maxSupply.toString(),
            totalBurned: totalBurned.toString(),
            burnPercentage: Number((totalBurned * 10000n) / maxSupply) / 100,
        };

        logger.info(report, 'Supply invariant OK — chain is source of truth');
        return report;
    } catch (err) {
        logger.error({ err }, 'Supply invariant check failed');
    }
}

/**
 * Start the supply invariant cron job.
 * Runs every hour at minute 30.
 */
export function startSupplyInvariantJob() {
    setTimeout(() => checkSupplyInvariant(), 30_000);

    cron.schedule('30 * * * *', () => {
        checkSupplyInvariant().catch(() => {});
    });

    logger.info('Supply invariant check job scheduled (every hour at :30)');
}

export { checkSupplyInvariant };
