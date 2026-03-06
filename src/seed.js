import prisma from './db.js';
import config from './config.js';
import { generateApiKey } from './utils.js';
import { generatePuzzle } from './crypto-puzzles.js';
import logger from './logger.js';

/**
 * Seed the database with launch-day computational puzzles.
 */
async function seed() {
    logger.info('🔥 Seeding The Forge with computational puzzles...');

    // ─── Create the House Smith ────────────────────
    const smith = await prisma.wallet.upsert({
        where: { name: 'the-forge' },
        update: {},
        create: {
            name: 'the-forge',
            apiKey: generateApiKey(),
            xHandle: '@theforge_gg',
            balance: 50000,
            gas: 10000,
        },
    });
    logger.info({ name: smith.name, id: smith.id, balance: smith.balance }, 'House smith ready');

    // ─── Generate puzzles across all types and tiers ──
    const puzzleSpecs = [
        // Tier 1 — Quick
        { type: 'HASH_PREFIX', tier: 1, stake: 100, time: 3600 },
        { type: 'PROOF_OF_WORK', tier: 1, stake: 100, time: 3600 },
        { type: 'FACTORING', tier: 1, stake: 100, time: 3600 },

        // Tier 2 — Moderate
        { type: 'HASH_PREFIX', tier: 2, stake: 200, time: 14400 },
        { type: 'PROOF_OF_WORK', tier: 2, stake: 200, time: 14400 },
        { type: 'FACTORING', tier: 2, stake: 200, time: 14400 },

        // Tier 3 — Hard
        { type: 'HASH_PREFIX', tier: 3, stake: 300, time: 43200 },
        { type: 'ITERATED_HASH', tier: 1, stake: 300, time: 43200 },

        // Tier 4 — Expert
        { type: 'PROOF_OF_WORK', tier: 4, stake: 400, time: 86400 },
        { type: 'FACTORING', tier: 4, stake: 400, time: 86400 },
    ];

    let created = 0;
    for (const spec of puzzleSpecs) {
        const generated = generatePuzzle(spec.type, spec.tier);

        await prisma.$transaction([
            prisma.puzzle.create({
                data: {
                    smithId: smith.id,
                    title: generated.title,
                    prompt: generated.prompt,
                    answerHash: generated.answerHash,
                    answerType: 'HASH',
                    puzzleType: spec.type,
                    challengeData: generated.challenge,
                    difficultyTier: spec.tier,
                    stake: spec.stake,
                    timeWindowSeconds: spec.time,
                    maxAttempts: 5,
                },
            }),
            prisma.wallet.update({
                where: { id: smith.id },
                data: { balance: { decrement: spec.stake } },
            }),
            prisma.transaction.create({
                data: {
                    fromId: smith.id,
                    amount: spec.stake,
                    type: 'STAKE_LOCK',
                    memo: `Launch: ${generated.title}`,
                },
            }),
        ]);

        created++;
        logger.info({
            title: generated.title,
            type: spec.type,
            tier: spec.tier,
            stake: spec.stake,
        }, 'Puzzle seeded');
    }

    const bal = await prisma.wallet.findUnique({ where: { id: smith.id }, select: { balance: true } });
    logger.info({ created, smithBalance: bal.balance }, '✓ Seeding complete');
    await prisma.$disconnect();
}

seed().catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
});
