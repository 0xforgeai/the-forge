import cron from 'node-cron';
import prisma from '../db.js';
import logger from '../logger.js';

/**
 * Supply Invariant Check
 *
 * Verifies the fundamental accounting identity:
 *   sum(wallet.balance) + sum(active stakes) + sum(unvested rewards)
 *     = total_minted - total_burned
 *
 * Runs every hour. Logs CRITICAL if invariant is violated.
 */

async function checkSupplyInvariant() {
    try {
        // 1. Sum all wallet balances
        const walletAgg = await prisma.wallet.aggregate({
            _sum: { balance: true },
        });
        const totalWalletBalance = walletAgg._sum.balance || 0;

        // 2. Sum all active stake positions
        const stakeAgg = await prisma.stakePosition.aggregate({
            where: { active: true },
            _sum: {
                amount: true,
                unvestedRewards: true,
                vestedAmount: true,
            },
        });
        const totalStaked = stakeAgg._sum.amount || 0;
        const totalUnvested = stakeAgg._sum.unvestedRewards || 0;
        const totalVested = stakeAgg._sum.vestedAmount || 0;

        // 3. Sum all minted (REGISTRATION grants + bootstrap emissions + initial supply)
        //    Minted = sum of all REGISTRATION tx + EMISSION ledger entries
        const registrationMinted = await prisma.transaction.aggregate({
            where: { type: 'REGISTRATION' },
            _sum: { amount: true },
        });
        const totalRegistrationMinted = registrationMinted._sum.amount || 0;

        // Bootstrap emissions from treasury ledger
        const emissionLedger = await prisma.treasuryLedger.aggregate({
            where: { action: { in: ['EMISSION', 'BOOTSTRAP_EMISSION', 'BOUT_INJECTION'] } },
            _sum: { amount: true },
        });
        const totalEmissions = emissionLedger._sum.amount || 0;

        // 4. Sum all burns
        const burnLedger = await prisma.treasuryLedger.aggregate({
            where: { action: 'BURN' },
            _sum: { amount: true },
        });
        const totalBurned = burnLedger._sum.amount || 0;

        // Also count BURN transactions
        const burnTx = await prisma.transaction.aggregate({
            where: { type: 'BURN' },
            _sum: { amount: true },
        });
        const totalBurnedTx = burnTx._sum.amount || 0;

        // 5. Calculate invariant
        const circulatingSide = totalWalletBalance + totalStaked + totalUnvested + totalVested;
        const supplySide = totalRegistrationMinted + totalEmissions;
        const burnSide = Math.max(totalBurned, totalBurnedTx); // deduplicated — use larger value

        const expectedCirculating = supplySide - burnSide;
        const drift = circulatingSide - expectedCirculating;

        const report = {
            totalWalletBalance,
            totalStaked,
            totalUnvested,
            totalVested,
            circulatingSide,
            totalRegistrationMinted,
            totalEmissions,
            supplySide,
            totalBurned: burnSide,
            expectedCirculating,
            drift,
        };

        if (drift !== 0) {
            logger.error(
                { ...report, invariantViolation: true },
                `SUPPLY INVARIANT VIOLATED — drift of ${drift} tokens detected`,
            );
        } else {
            logger.info(report, 'Supply invariant OK');
        }

        return report;
    } catch (err) {
        logger.error({ err }, 'Supply invariant check failed');
        throw err;
    }
}

/**
 * Start the supply invariant cron job.
 * Runs every hour at minute 30.
 */
export function startSupplyInvariantJob() {
    // Run once immediately on startup (delayed 30s to let DB warm up)
    setTimeout(() => checkSupplyInvariant(), 30_000);

    // Then every hour at :30
    cron.schedule('30 * * * *', () => {
        checkSupplyInvariant().catch(() => { }); // errors already logged inside
    });

    logger.info('Supply invariant check job scheduled (every hour at :30)');
}

export { checkSupplyInvariant };
