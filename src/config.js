import dotenv from 'dotenv';
dotenv.config();

// ─── Fail-safe: require critical secrets in production ─────
if (process.env.NODE_ENV === 'production') {
    const required = ['HMAC_SECRET', 'ADMIN_USER', 'ADMIN_PASS'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.error(`FATAL: Missing required env vars in production: ${missing.join(', ')}`);
        process.exit(1);
    }
    if (process.env.HMAC_SECRET === 'forge-dev-secret' || process.env.HMAC_SECRET === 'forge-dev-secret-change-me-in-prod') {
        console.error('FATAL: HMAC_SECRET is using a default/dev value in production');
        process.exit(1);
    }
}

const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    hmacSecret: process.env.HMAC_SECRET || 'forge-dev-secret',
    admin: {
        user: process.env.ADMIN_USER || 'admin',
        pass: process.env.ADMIN_PASS || 'forgeadmin',
    },
    sentryDsn: process.env.SENTRY_DSN || '',
    game: {
        initialBalance: parseInt(process.env.INITIAL_BALANCE || '1000', 10),
        // Gas system removed — users pay real Base L2 gas
        // Tier config: [minStake, minTimeWindow, maxTimeWindow] in seconds
        tiers: {
            1: { minStake: 100, minTime: 3600, maxTime: 14400 },         // 1-4h
            2: { minStake: 200, minTime: 14400, maxTime: 43200 },        // 4-12h
            3: { minStake: 300, minTime: 43200, maxTime: 86400 },        // 12-24h
            4: { minStake: 400, minTime: 86400, maxTime: 172800 },       // 24-48h
            5: { minStake: 500, minTime: 172800, maxTime: 604800 },      // 48h-7d
        },
        // Reveal deadline: 48h after expiry
        revealDeadlineSeconds: 172800,
        // Rewards: tier * multiplier
        solveRewardMultiplier: 10,
        smithRewardMultiplier: 3,
    },
    bout: {
        entryFee: 500,
        minBalanceToEnter: 1000,
        minAccountAgeDays: 0,
        minSolvesToEnter: 3,
        protocolRakePercent: 5,
        agentPursePercent: 20,
        bettorPoolPercent: 75,
        podiumSplit: [60, 25, 15],        // 1st/2nd/3rd % of agent purse
        podiumThreshold: 8,                // entrants needed for podium
        maxBetPercent: 10,                 // max % of pool per bet
        registrationHoursBefore: 48,
        bettingHoursBefore: 12,
        bettingCloseHoursBefore: 1,
        solveDurationSecs: 3600,           // 1 hour
        boutsPerWeek: 3,
        minPoolGuarantee: 5000,
    },
    vault: {
        covenants: {
            FLAME: { lockDays: 1, apyBonus: 0, rageQuitMulti: 1.0 },
            STEEL: { lockDays: 3, apyBonus: 50, rageQuitMulti: 2.0 },
            OBSIDIAN: { lockDays: 7, apyBonus: 150, rageQuitMulti: 3.0 },
            ETERNAL: { lockDays: 30, apyBonus: 300, rageQuitMulti: Infinity },
        },
        rageQuitTax: [50, 40, 30, 20, 10, 5, 0],  // % per DAY (index = day - 1), 0 after day 6
        loyaltySchedule: [1.0, 1.2, 1.5, 2.0, 2.5, 3.0],  // multiplier per DAY (max at day 6)
        vestingDays: 5,
        minStake: 100,
    },
    burns: {
        entryFeePercent: 10,
        betPercent: 2,
        losingBetPercent: 100,
        gasBurn: true,
        registrationBurn: 50,
    },
    bootstrap: {
        schedule: [
            { dayStart: 1, dayEnd: 2, apyPercent: 2000, boutInjection: 200000, betMiningBonus: 25 },
            { dayStart: 3, dayEnd: 4, apyPercent: 1200, boutInjection: 150000, betMiningBonus: 20 },
            { dayStart: 5, dayEnd: 6, apyPercent: 600, boutInjection: 100000, betMiningBonus: 15 },
            { dayStart: 7, dayEnd: 8, apyPercent: 200, boutInjection: 50000, betMiningBonus: 10 },
            { dayStart: 9, dayEnd: 10, apyPercent: 75, boutInjection: 20000, betMiningBonus: 5 },
        ],
        firstStakerBonuses: [
            { maxStaker: 100, bonus: 5000 },
            { maxStaker: 300, bonus: 2000 },
            { maxStaker: 500, bonus: 1000 },
            { maxStaker: 750, bonus: 500 },
        ],
    },
    victory: {
        instantBurnPercent: 5,
        bond: {
            discountPercent: 10,
            treasuryFillDays: 14,
            treasuryFillBudget: 500000,
            minBondSize: 100,
            partialFillMin: 50,
            expiryDays: 7,
        },
    },
    chain: {
        rpcUrl: process.env.BASE_RPC_URL || '',
        forgeTokenAddress: process.env.FORGE_TOKEN_ADDRESS || '0xf6c2965295ce2178f64832163a9a97ccf61a3aee',
        arenaVaultAddress: process.env.ARENA_VAULT_ADDRESS || '0x77917FD54484552F7d2c8bace5270C40c3fc1380',
        forgeArenaAddress: process.env.FORGE_ARENA_ADDRESS || '0x22FFDf9E88cEFE2781b9Ebe17eabd4388Ab6cff4',
        victoryEscrowAddress: process.env.VICTORY_ESCROW_ADDRESS || '0x0d5ba0f83fC31c24b6a461F238d697D42510f507',
        forgeBondsAddress: process.env.FORGE_BONDS_ADDRESS || '0x67eade0109180c16B3e6b5c65c963aD821AE505c',
        deployerAddress: process.env.DEPLOYER_ADDRESS || '0x64A4eA07B1caAE927FD2ecACd4d295db38049c39',
        confirmations: 1,
        maxEntrants: 16,
        entryBurnBps: 1000,   // 10%
        betBurnBps: 200,      // 2%
        protocolRakeBps: 500, // 5%
        agentPurseBps: 2000,  // 20%
        bettorPoolBps: 7500,  // 75%
    },
};
export default config;
