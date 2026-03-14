/**
 * Seed the first bout — "Trial #1: The Ignition"
 *
 * Scheduled: March 16, 2026 at 7:00 PM PDT (2026-03-17T02:00:00Z)
 * Registration opens: ~48h before (March 14, 7:00 PM PDT)
 * Betting opens: 12h before (March 16, 7:00 AM PDT)
 * Betting closes: 1h before (March 16, 6:00 PM PDT)
 */

import prisma from './db.js';
import logger from './logger.js';

async function seedFirstBout() {
    logger.info('🔥 Seeding first bout: Trial #1: The Ignition');

    const title = 'Trial #1: The Ignition';

    // Check if already exists
    const existing = await prisma.bout.findFirst({ where: { title } });
    if (existing) {
        logger.info({ boutId: existing.id, status: existing.status }, 'First bout already exists, skipping');
        await prisma.$disconnect();
        return;
    }

    // March 16, 2026 at 7:00 PM PDT = March 17, 2026 at 02:00:00 UTC
    const scheduledAt = new Date('2026-03-17T02:00:00Z');

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
║  Scheduled:     Mar 16 @ 7:00 PM PDT             ║
║  Registration:  Mar 14 @ 7:00 PM PDT (NOW)       ║
║  Betting Opens: Mar 16 @ 7:00 AM PDT             ║
║  Betting Close: Mar 16 @ 6:00 PM PDT             ║
╚══════════════════════════════════════════════════╝
`);

    await prisma.$disconnect();
}

seedFirstBout().catch((err) => {
    logger.error({ err }, 'First bout seed failed');
    process.exit(1);
});
