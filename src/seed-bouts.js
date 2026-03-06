/**
 * Seed 3 upcoming bouts for launch week.
 *
 * For testing, bouts are scheduled close together (minutes apart).
 * In production, use the Tue/Thu/Sat schedule.
 */

import prisma from './db.js';
import logger from './logger.js';

async function seedBouts() {
    logger.info('🔥 Seeding launch bouts...');

    const now = new Date();

    // Helper: create a bout with timeline offsets (in minutes from now)
    function boutTimeline(minutesFromNow) {
        const scheduled = new Date(now.getTime() + minutesFromNow * 60000);
        return {
            scheduledAt: scheduled,
            registrationOpensAt: new Date(scheduled.getTime() - 48 * 3600000),  // 48h before
            bettingOpensAt: new Date(scheduled.getTime() - 12 * 3600000),       // 12h before
            bettingClosesAt: new Date(scheduled.getTime() - 1 * 3600000),       // 1h before
        };
    }

    // For dev/testing: bouts that transition quickly
    function devTimeline(minutesFromNow) {
        const scheduled = new Date(now.getTime() + minutesFromNow * 60000);
        return {
            scheduledAt: scheduled,
            registrationOpensAt: new Date(now.getTime() - 60000),   // already open
            bettingOpensAt: new Date(now.getTime() - 60000),        // already open
            bettingClosesAt: new Date(now.getTime() + minutesFromNow * 60000),  // closes when bout starts
        };
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const timeline = isDev ? devTimeline : boutTimeline;

    const bouts = [
        {
            title: 'Bout #1: Hash Hunt',
            puzzleType: 'HASH_PREFIX',
            difficultyTier: 2,
            entryFee: 500,
            solveDurationSecs: 3600,
            ...timeline(5),  // 5 minutes from now in dev
        },
        {
            title: 'Bout #2: Factor Wars',
            puzzleType: 'FACTORING',
            difficultyTier: 3,
            entryFee: 500,
            solveDurationSecs: 3600,
            ...timeline(120),  // 2 hours from now in dev
        },
        {
            title: 'Bout #3: Proof of Grind',
            puzzleType: 'PROOF_OF_WORK',
            difficultyTier: 2,
            entryFee: 500,
            solveDurationSecs: 3600,
            ...timeline(240),  // 4 hours from now in dev
        },
    ];

    let created = 0;
    for (const b of bouts) {
        const existing = await prisma.bout.findFirst({ where: { title: b.title } });
        if (existing) {
            logger.info({ title: b.title }, 'Already exists, skipping');
            continue;
        }

        const bout = await prisma.bout.create({
            data: {
                title: b.title,
                puzzleType: b.puzzleType,
                difficultyTier: b.difficultyTier,
                entryFee: b.entryFee,
                solveDurationSecs: b.solveDurationSecs,
                scheduledAt: b.scheduledAt,
                registrationOpensAt: b.registrationOpensAt,
                bettingOpensAt: b.bettingOpensAt,
                bettingClosesAt: b.bettingClosesAt,
                status: 'SCHEDULED',
            },
        });

        created++;
        logger.info({
            title: bout.title,
            type: bout.puzzleType,
            tier: bout.difficultyTier,
            scheduledAt: bout.scheduledAt,
            status: bout.status,
        }, 'Bout seeded');
    }

    logger.info({ created }, '✓ Bout seeding complete');
    await prisma.$disconnect();
}

seedBouts().catch((err) => {
    logger.error({ err }, 'Bout seed failed');
    process.exit(1);
});
