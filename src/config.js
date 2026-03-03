import dotenv from 'dotenv';
dotenv.config();

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
        initialGas: parseInt(process.env.INITIAL_GAS || '500', 10),
        // Gas costs
        gasCostCreate: 50,
        gasCostPick: 25,
        gasCostSolve: 10,
        gasCostTransfer: 5,
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
};

export default config;
