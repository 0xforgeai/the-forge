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
        const totalWalletBalance = walletAgg._sum.balance ?? 0n;

        // 2. Sum all active stake positions
        const stakeAgg = await prisma.stakePosition.aggregate({
            where: { active: true },
            _sum: {
                amount: true,
                unvestedRewards: true,
                vestedAmount: true,
            },
        });
        const totalStaked = stakeAgg._sum.amount ?? 0n;
        const totalUnvested = stakeAgg._sum.unvestedRewards ?? 0n;
        const totalVested = stakeAgg._sum.vestedAmount ?? 0n;

        // 3. Sum all minted (REGISTRATION grants + bootstrap emissions + initial supply)
        //    Minted = sum of all REGISTRATION tx + EMISSION ledger entries
        const registrationMinted = await prisma.transaction.aggregate({
            where: { type: 'REGISTRATION' },
            _sum: { amount: true },
        });
        const totalRegistrationMinted = registrationMinted._sum.amount ?? 0n;

        // Bootstrap emissions from treasury ledger
        const emissionLedger = await prisma.treasuryLedger.aggregate({
            where: { action: { in: ['EMISSION', 'BOOTSTRAP_EMISSION', 'BOUT_INJECTION'] } },
            _sum: { amount: true },
        });
        const totalEmissions = emissionLedger._sum.amount ?? 0n;

        // 4. Sum all burns (ledger tracks burns under multiple action names)
        const burnLedger = await prisma.treasuryLedger.aggregate({
            where: { action: { in: ['BURN', 'ENTRY_FEE_BURN', 'BET_BURN'] } },
            _sum: { amount: true },
        });
        const totalBurned = burnLedger._sum.amount ?? 0n;

        // Also count BURN transactions as a cross-check
        const burnTx = await prisma.transaction.aggregate({
            where: { type: 'BURN' },
            _sum: { amount: true },
        });
        const totalBurnedTx = burnTx._sum.amount ?? 0n;

        // 4b. Sum tokens locked in active bouts (entry pools + bet pools not yet resolved)
        const boutPoolAgg = await prisma.bout.aggregate({
            where: { status: { in: ['REGISTRATION', 'BETTING', 'LIVE', 'RESOLVING'] } },
            _sum: {
                totalEntryFees: true,
                totalBetPool: true,
            },
        });
        const totalBoutPools = (boutPoolAgg._sum.totalEntryFees ?? 0n) + (boutPoolAgg._sum.totalBetPool ?? 0n);

        // 4c. Sum rage quit taxes (deducted from wallets, held by treasury — not burned, not in any wallet)
        const rageTaxLedger = await prisma.treasuryLedger.aggregate({
            where: { action: 'RAGE_TAX' },
            _sum: { amount: true },
        });
        const totalRageTax = rageTaxLedger._sum.amount ?? 0n;

        // 5. Calculate invariant
        const circulatingSide = totalWalletBalance + totalStaked + totalUnvested + totalVested + totalBoutPools + totalRageTax;
        const supplySide = totalRegistrationMinted + totalEmissions;
        const burnSide = totalBurned > totalBurnedTx ? totalBurned : totalBurnedTx;

        const expectedCirculating = supplySide - burnSide;
        const drift = circulatingSide - expectedCirculating;

        const report = {
            totalWalletBalance,
            totalStaked,
            totalUnvested,
            totalVested,
            totalBoutPools,
            totalRageTax,
            circulatingSide,
            totalRegistrationMinted,
            totalEmissions,
            supplySide,
            totalBurned: burnSide,
            expectedCirculating,
            drift,
        };

        if (drift !== 0n) {
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
        // Don't rethrow — prevent crash loops
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
