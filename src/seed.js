import prisma from './db.js';
import config from './config.js';
import { hashAnswer, generateApiKey } from './utils.js';
import logger from './logger.js';

/**
 * Seed the database with sample data for development/testing.
 */
async function seed() {
    logger.info('Seeding database...');

    // Create a test smith
    const smith = await prisma.wallet.upsert({
        where: { name: 'test-smith' },
        update: {},
        create: {
            name: 'test-smith',
            apiKey: generateApiKey(),
            xHandle: '@test_smith',
            balance: config.game.initialBalance,
            gas: config.game.initialGas,
        },
    });

    // Create a test solver
    const solver = await prisma.wallet.upsert({
        where: { name: 'test-solver' },
        update: {},
        create: {
            name: 'test-solver',
            apiKey: generateApiKey(),
            xHandle: '@test_solver',
            balance: config.game.initialBalance,
            gas: config.game.initialGas,
        },
    });

    logger.info({ smith: smith.name, smithApiKey: smith.apiKey }, 'Test smith created');
    logger.info({ solver: solver.name, solverApiKey: solver.apiKey }, 'Test solver created');

    // Create sample puzzles
    const puzzles = [
        {
            title: 'Base Genesis Block',
            prompt: 'What was the timestamp (Unix epoch) of the first block on Base mainnet?',
            answer: '1686789347',
            answerType: 'NUMBER',
            difficultyTier: 2,
            stake: 200,
            timeWindowSeconds: 14400,
            maxAttempts: 3,
        },
        {
            title: 'Ethereum Merge Block',
            prompt: 'What was the block number of the first post-merge (PoS) block on Ethereum mainnet?',
            answer: '15537394',
            answerType: 'NUMBER',
            difficultyTier: 1,
            stake: 100,
            timeWindowSeconds: 7200,
            maxAttempts: 3,
        },
        {
            title: 'Vitalik\'s Favorite Number',
            prompt: 'Vitalik once said his favorite number is the answer to: "What is the smallest positive integer that is not a sum of distinct powers of 3?" What is it?',
            answer: '2',
            answerType: 'NUMBER',
            difficultyTier: 1,
            stake: 100,
            timeWindowSeconds: 3600,
            maxAttempts: 5,
        },
    ];

    for (const p of puzzles) {
        const existing = await prisma.puzzle.findFirst({ where: { title: p.title } });
        if (existing) {
            logger.info({ title: p.title }, 'Puzzle already exists, skipping');
            continue;
        }

        const answerHash = hashAnswer(p.answer, p.answerType);

        await prisma.$transaction([
            prisma.puzzle.create({
                data: {
                    smithId: smith.id,
                    title: p.title,
                    prompt: p.prompt,
                    answerHash,
                    answerType: p.answerType,
                    difficultyTier: p.difficultyTier,
                    stake: p.stake,
                    timeWindowSeconds: p.timeWindowSeconds,
                    maxAttempts: p.maxAttempts,
                },
            }),
            prisma.wallet.update({
                where: { id: smith.id },
                data: { balance: { decrement: p.stake } },
            }),
            prisma.transaction.create({
                data: {
                    fromId: smith.id,
                    amount: p.stake,
                    type: 'STAKE_LOCK',
                    memo: `Seed: staked on "${p.title}"`,
                },
            }),
        ]);

        logger.info({ title: p.title, tier: p.difficultyTier, stake: p.stake }, 'Puzzle seeded');
    }

    logger.info('Seeding complete ✓');
    await prisma.$disconnect();
}

seed().catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
});
