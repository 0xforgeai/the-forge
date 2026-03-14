import cron from 'node-cron';
import prisma from '../db.js';
import config from '../config.js';
import sse from '../sse.js';
import logger from '../logger.js';

/**
 * Start all background jobs.
 */
export function startJobs() {
    // ─── Expire picked puzzles that have exceeded their time window ───
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const expiredPuzzles = await prisma.puzzle.findMany({
                where: {
                    status: 'PICKED',
                    pickedAt: { not: null },
                },
                include: {
                    smith: { select: { name: true } },
                    solver: { select: { name: true } },
                },
            });

            for (const puzzle of expiredPuzzles) {
                const elapsed = Math.floor((now.getTime() - puzzle.pickedAt.getTime()) / 1000);
                if (elapsed <= puzzle.timeWindowSeconds) continue;

                // Mark as expired, set reveal deadline
                const revealDeadline = new Date(now.getTime() + config.game.revealDeadlineSeconds * 1000);

                await prisma.puzzle.update({
                    where: { id: puzzle.id },
                    data: {
                        status: 'EXPIRED',
                        expiredAt: now,
                        revealDeadline,
                    },
                });

                logger.info(
                    { puzzleId: puzzle.id, title: puzzle.title, solver: puzzle.solver?.name },
                    'Puzzle expired (time window exceeded)'
                );

                sse.broadcast('puzzle.expired', {
                    id: puzzle.id,
                    title: puzzle.title,
                    smith: puzzle.smith.name,
                    solver: puzzle.solver?.name,
                });
            }
        } catch (err) {
            logger.error({ err }, 'Expiry job error');
        }
    });

    // ─── Slash smiths who haven't revealed within the deadline ────────
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const slashable = await prisma.puzzle.findMany({
                where: {
                    status: 'EXPIRED',
                    revealDeadline: { lt: now },
                },
                include: {
                    smith: { select: { id: true, name: true } },
                },
            });

            for (const puzzle of slashable) {
                await prisma.$transaction([
                    prisma.puzzle.update({
                        where: { id: puzzle.id },
                        data: { status: 'SLASHED' },
                    }),
                    // Stake is burned (not returned to smith)
                    prisma.transaction.create({
                        data: {
                            fromId: puzzle.smith.id,
                            amount: puzzle.stake,
                            type: 'STAKE_SLASH',
                            puzzleId: puzzle.id,
                            memo: `Slashed: failed to reveal within deadline`,
                        },
                    }),
                    // Decrease smith reputation (M-10 fix: floor at 0)
                    prisma.$executeRaw`UPDATE wallets SET reputation = GREATEST(0, reputation - ${puzzle.difficultyTier}) WHERE id = ${puzzle.smith.id}`,
                ]);

                logger.warn(
                    { puzzleId: puzzle.id, smith: puzzle.smith.name, stake: puzzle.stake },
                    'Smith slashed for failing to reveal'
                );

                sse.broadcast('puzzle.slashed', {
                    id: puzzle.id,
                    title: puzzle.title,
                    smith: puzzle.smith.name,
                    stakeBurned: puzzle.stake,
                });
            }
        } catch (err) {
            logger.error({ err }, 'Slashing job error');
        }
    });

    // ─── Expire bonds past their expiry timestamp (on-chain) ─────
    // Contracts can't self-execute, so backend calls expireBond() as a public service
    cron.schedule('*/15 * * * *', async () => {
        try {
            const { chainReady } = await import('../chain/index.js');
            if (!chainReady) return;

            const { getActiveBonds, getBond, expireBond } = await import('../chain/bonds.js');
            const activeBondIds = await getActiveBonds();

            for (const bondId of activeBondIds) {
                try {
                    const bond = await getBond(bondId);
                    const now = Math.floor(Date.now() / 1000);
                    if (bond.expiresAt <= now && !bond.expired) {
                        await expireBond(bondId);
                        logger.info({ bondId: bondId.toString() }, 'Bond expired on-chain');
                    }
                } catch (err) {
                    logger.error({ err, bondId: bondId.toString() }, 'Failed to expire bond');
                }
            }
        } catch (err) {
            logger.error({ err }, 'Bond expiry job error');
        }
    });

    logger.info('Background jobs started (expiry + slashing + bond expiry)');
}
