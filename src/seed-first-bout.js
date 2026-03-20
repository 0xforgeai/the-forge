/**
 * Seed the first bout — "Trial #1: The Ignition"
 *
 * Scheduled: March 22, 2026 at 9:00 AM PDT (2026-03-22T16:00:00Z)
 * Registration opens: ~48h before (March 20, 9:00 AM PDT)
 * Betting opens: 12h before (March 21, 9:00 PM PDT)
 * Betting closes: 1h before (March 22, 8:00 AM PDT)
 */

import prisma from './db.js';
import logger from './logger.js';

async function seedFirstBout() {
    logger.info('🔥 Seeding first bout: Trial #1: The Ignition');

    const title = 'Trial #1: The Ignition';

    // Delete previous version if exists (date changed)
    const existing = await prisma.bout.findFirst({ where: { title } });
    if (existing) {
        await prisma.bout.delete({ where: { id: existing.id } });
        logger.info({ boutId: existing.id }, 'Deleted previous bout seed (date changed)');
    }

    // March 22, 2026 at 9:00 AM PDT = March 22, 2026 at 16:00:00 UTC
    const scheduledAt = new Date('2026-03-22T16:00:00Z');

    const bout = await prisma.bout.create({
        data: {
            title,
            puzzleType: 'HASH_PREFIX',
            difficultyTier: 2,
            entryFee: 500,
            solveDurationSecs: 3600, // 1 hour
            scheduledAt,
            registrationOpensAt: new Date(scheduledAt.getTime() - 48 * 3600000),  // 48h before
            bettingOpensAt: new Date(scheduledAt.getTime() - 12 * 3600000),       // 12h before
            bettingClosesAt: new Date(scheduledAt.getTime() - 1 * 3600000),       // 1h before
            status: 'SCHEDULED',
        },
    });

    logger.info({
        boutId: bout.id,
        title: bout.title,
        type: bout.puzzleType,
        tier: bout.difficultyTier,
        scheduledAt: bout.scheduledAt.toISOString(),
        registrationOpensAt: bout.registrationOpensAt.toISOString(),
        bettingOpensAt: bout.bettingOpensAt.toISOString(),
        bettingClosesAt: bout.bettingClosesAt.toISOString(),
    }, '✓ First bout seeded!');

    console.log(`
╔══════════════════════════════════════════════════╗
║  Trial #1: The Ignition                         ║
║  Type: HASH_PREFIX (Tier 2)                      ║
║  Entry Fee: 500 $FORGE                           ║
║  Solve Time: 1 hour                              ║
║                                                  ║
║  Scheduled:     Mar 22 @ 9:00 AM PDT             ║
║  Registration:  Mar 20 @ 9:00 AM PDT (NOW)       ║
║  Betting Opens: Mar 21 @ 9:00 PM PDT             ║
║  Betting Close: Mar 22 @ 8:00 AM PDT             ║
╚══════════════════════════════════════════════════╝
`);

    await prisma.$disconnect();
}

seedFirstBout().catch((err) => {
    logger.error({ err }, 'First bout seed failed');
    process.exit(1);
});

