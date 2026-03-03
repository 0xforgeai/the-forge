import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { hashAnswer, verifyAnswer, validateTier } from '../utils.js';
import { authenticate } from '../middleware/auth.js';
import sse from '../sse.js';
import logger from '../logger.js';

const router = Router();

// ─── Create Puzzle ─────────────────────────────────────────

const createSchema = z.object({
    title: z.string().min(3).max(120),
    prompt: z.string().min(10).max(2000),
    answer: z.string().min(1).max(500),
    answerType: z.enum(['STRING', 'NUMBER', 'CHOICE']).default('STRING'),
    difficultyTier: z.number().int().min(1).max(5),
    stake: z.number().int().min(100),
    timeWindowSeconds: z.number().int().min(3600),
    maxAttempts: z.number().int().min(1).max(10).default(3),
});

router.post('/', authenticate, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { title, prompt, answer, answerType, difficultyTier, stake, timeWindowSeconds, maxAttempts } = parsed.data;
    const wallet = req.wallet;

    // Validate tier
    const tierCheck = validateTier(difficultyTier, stake, timeWindowSeconds);
    if (!tierCheck.valid) {
        return res.status(400).json({ error: tierCheck.error });
    }

    // Check gas
    if (wallet.gas < config.game.gasCostCreate) {
        return res.status(400).json({ error: `Insufficient gas. Need ${config.game.gasCostCreate}, have ${wallet.gas}.` });
    }

    // Check balance for stake
    if (wallet.balance < stake) {
        return res.status(400).json({ error: `Insufficient balance to stake ${stake}. Have ${wallet.balance}.` });
    }

    // Hash the answer server-side with HMAC
    const answerHash = hashAnswer(answer, answerType);

    // Create puzzle + deduct stake + gas in a transaction
    const [puzzle] = await prisma.$transaction([
        prisma.puzzle.create({
            data: {
                smithId: wallet.id,
                title,
                prompt,
                answerHash,
                answerType,
                difficultyTier,
                stake,
                timeWindowSeconds,
                maxAttempts,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { decrement: stake },
                gas: { decrement: config.game.gasCostCreate },
            },
        }),
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: stake,
                type: 'STAKE_LOCK',
                memo: `Staked ${stake} on puzzle: ${title}`,
            },
        }),
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: config.game.gasCostCreate,
                type: 'GAS_SPEND',
                memo: 'Gas: create puzzle',
            },
        }),
    ]);

    logger.info({ puzzleId: puzzle.id, smith: wallet.name, tier: difficultyTier, stake }, 'Puzzle created');

    sse.broadcast('puzzle.created', {
        id: puzzle.id,
        title: puzzle.title,
        tier: puzzle.difficultyTier,
        stake: puzzle.stake,
        smith: wallet.name,
    });

    res.status(201).json({
        id: puzzle.id,
        title: puzzle.title,
        tier: puzzle.difficultyTier,
        stake: puzzle.stake,
        status: puzzle.status,
        timeWindowSeconds: puzzle.timeWindowSeconds,
        maxAttempts: puzzle.maxAttempts,
        message: 'Puzzle created. Stake locked.',
    });
});

// ─── List Puzzles ──────────────────────────────────────────

router.get('/', async (req, res) => {
    const status = req.query.status;
    const where = status ? { status: status.toUpperCase() } : {};

    const puzzles = await prisma.puzzle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
            smith: { select: { name: true, xHandle: true } },
            solver: { select: { name: true } },
        },
    });

    // Hide prompt for OPEN puzzles, hide answer hash always
    const sanitized = puzzles.map((p) => ({
        id: p.id,
        title: p.title,
        prompt: p.status === 'OPEN' ? null : p.prompt,
        answerType: p.answerType,
        tier: p.difficultyTier,
        stake: p.stake,
        status: p.status,
        smith: p.smith.name,
        solver: p.solver?.name || null,
        attemptsUsed: p.attemptsUsed,
        maxAttempts: p.maxAttempts,
        timeWindowSeconds: p.timeWindowSeconds,
        pickedAt: p.pickedAt,
        solvedAt: p.solvedAt,
        createdAt: p.createdAt,
        timeRemaining:
            p.status === 'PICKED' && p.pickedAt
                ? Math.max(0, p.timeWindowSeconds - Math.floor((Date.now() - p.pickedAt.getTime()) / 1000))
                : null,
    }));

    res.json({ puzzles: sanitized, total: sanitized.length });
});

// ─── Get Puzzle Detail ─────────────────────────────────────

router.get('/:id', async (req, res) => {
    const puzzle = await prisma.puzzle.findUnique({
        where: { id: req.params.id },
        include: {
            smith: { select: { name: true, xHandle: true } },
            solver: { select: { name: true } },
            solveAttempts: {
                select: { correct: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            },
        },
    });

    if (!puzzle) {
        return res.status(404).json({ error: 'Puzzle not found.' });
    }

    res.json({
        id: puzzle.id,
        title: puzzle.title,
        prompt: puzzle.status === 'OPEN' ? null : puzzle.prompt,
        answerType: puzzle.answerType,
        tier: puzzle.difficultyTier,
        stake: puzzle.stake,
        status: puzzle.status,
        smith: puzzle.smith.name,
        solver: puzzle.solver?.name || null,
        attemptsUsed: puzzle.attemptsUsed,
        maxAttempts: puzzle.maxAttempts,
        timeWindowSeconds: puzzle.timeWindowSeconds,
        pickedAt: puzzle.pickedAt,
        solvedAt: puzzle.solvedAt,
        revealedAnswer: puzzle.revealedAnswer,
        createdAt: puzzle.createdAt,
        attempts: puzzle.solveAttempts.map((a) => ({
            correct: a.correct,
            at: a.createdAt,
        })),
        timeRemaining:
            puzzle.status === 'PICKED' && puzzle.pickedAt
                ? Math.max(0, puzzle.timeWindowSeconds - Math.floor((Date.now() - puzzle.pickedAt.getTime()) / 1000))
                : null,
    });
});

// ─── Pick Puzzle ───────────────────────────────────────────

router.post('/:id/pick', authenticate, async (req, res) => {
    const wallet = req.wallet;

    if (wallet.gas < config.game.gasCostPick) {
        return res.status(400).json({ error: `Insufficient gas. Need ${config.game.gasCostPick}, have ${wallet.gas}.` });
    }

    const puzzle = await prisma.puzzle.findUnique({ where: { id: req.params.id } });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    if (puzzle.status !== 'OPEN') return res.status(400).json({ error: `Puzzle is ${puzzle.status}, not open.` });
    if (puzzle.smithId === wallet.id) return res.status(400).json({ error: "Can't pick your own puzzle." });

    const [updated] = await prisma.$transaction([
        prisma.puzzle.update({
            where: { id: puzzle.id },
            data: {
                status: 'PICKED',
                solverId: wallet.id,
                pickedAt: new Date(),
                attemptsUsed: 0,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { gas: { decrement: config.game.gasCostPick } },
        }),
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: config.game.gasCostPick,
                type: 'GAS_SPEND',
                puzzleId: puzzle.id,
                memo: 'Gas: pick puzzle',
            },
        }),
    ]);

    logger.info({ puzzleId: puzzle.id, solver: wallet.name }, 'Puzzle picked');

    sse.broadcast('puzzle.picked', {
        id: puzzle.id,
        title: puzzle.title,
        solver: wallet.name,
        tier: puzzle.difficultyTier,
    });

    res.json({
        id: updated.id,
        title: updated.title,
        prompt: puzzle.prompt,
        answerType: puzzle.answerType,
        tier: puzzle.difficultyTier,
        stake: puzzle.stake,
        maxAttempts: puzzle.maxAttempts,
        timeWindowSeconds: puzzle.timeWindowSeconds,
        pickedAt: updated.pickedAt,
        message: `Puzzle picked. You have ${puzzle.timeWindowSeconds}s and ${puzzle.maxAttempts} attempts. Go.`,
    });
});

// ─── Solve Puzzle ──────────────────────────────────────────

const solveSchema = z.object({
    answer: z.string().min(1).max(500),
});

router.post('/:id/solve', authenticate, async (req, res) => {
    const parsed = solveSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { answer } = parsed.data;

    if (wallet.gas < config.game.gasCostSolve) {
        return res.status(400).json({ error: `Insufficient gas. Need ${config.game.gasCostSolve}, have ${wallet.gas}.` });
    }

    const puzzle = await prisma.puzzle.findUnique({ where: { id: req.params.id } });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    if (puzzle.status !== 'PICKED') return res.status(400).json({ error: `Puzzle is ${puzzle.status}, not picked.` });
    if (puzzle.solverId !== wallet.id) return res.status(403).json({ error: 'You are not the active solver for this puzzle.' });

    // Check time window
    const elapsed = Math.floor((Date.now() - puzzle.pickedAt.getTime()) / 1000);
    if (elapsed > puzzle.timeWindowSeconds) {
        return res.status(400).json({ error: 'Time window expired. Puzzle will be marked expired by the system.' });
    }

    // Verify answer
    const correct = verifyAnswer(answer, puzzle.answerType, puzzle.answerHash);

    // Record attempt
    await prisma.solveAttempt.create({
        data: {
            puzzleId: puzzle.id,
            solverId: wallet.id,
            submittedAnswer: answer,
            correct,
        },
    });

    // Deduct gas
    await prisma.wallet.update({
        where: { id: wallet.id },
        data: { gas: { decrement: config.game.gasCostSolve } },
    });

    await prisma.transaction.create({
        data: {
            fromId: wallet.id,
            amount: config.game.gasCostSolve,
            type: 'GAS_SPEND',
            puzzleId: puzzle.id,
            memo: 'Gas: solve attempt',
        },
    });

    if (correct) {
        // ✅ SOLVED: solver gets stake + tier reward
        const reward = puzzle.difficultyTier * config.game.solveRewardMultiplier;
        const totalPayout = puzzle.stake + reward;

        await prisma.$transaction([
            prisma.puzzle.update({
                where: { id: puzzle.id },
                data: {
                    status: 'SOLVED',
                    solvedAt: new Date(),
                    attemptsUsed: { increment: 1 },
                },
            }),
            prisma.wallet.update({
                where: { id: wallet.id },
                data: {
                    balance: { increment: totalPayout },
                    reputation: { increment: puzzle.difficultyTier },
                },
            }),
            prisma.transaction.create({
                data: {
                    toId: wallet.id,
                    amount: totalPayout,
                    type: 'SOLVE_REWARD',
                    puzzleId: puzzle.id,
                    memo: `Solved! Stake ${puzzle.stake} + reward ${reward}`,
                },
            }),
        ]);

        logger.info({ puzzleId: puzzle.id, solver: wallet.name, payout: totalPayout }, 'Puzzle solved');

        sse.broadcast('puzzle.solved', {
            id: puzzle.id,
            title: puzzle.title,
            solver: wallet.name,
            payout: totalPayout,
            tier: puzzle.difficultyTier,
        });

        return res.json({
            correct: true,
            payout: totalPayout,
            stake: puzzle.stake,
            reward,
            message: `Correct! You earned ${totalPayout} $FORGE (${puzzle.stake} stake + ${reward} reward).`,
        });
    }

    // ❌ Wrong answer
    const newAttempts = puzzle.attemptsUsed + 1;

    if (newAttempts >= puzzle.maxAttempts) {
        // Max attempts reached — reset puzzle to open
        await prisma.puzzle.update({
            where: { id: puzzle.id },
            data: {
                status: 'OPEN',
                solverId: null,
                pickedAt: null,
                attemptsUsed: 0,
            },
        });

        logger.info({ puzzleId: puzzle.id, solver: wallet.name }, 'Puzzle reset to open (max attempts)');

        sse.broadcast('puzzle.reset', {
            id: puzzle.id,
            title: puzzle.title,
            previousSolver: wallet.name,
        });

        return res.json({
            correct: false,
            attemptsUsed: newAttempts,
            maxAttempts: puzzle.maxAttempts,
            message: 'Wrong. Maximum attempts reached. Puzzle is back in the open pool.',
        });
    }

    // Still has attempts left
    await prisma.puzzle.update({
        where: { id: puzzle.id },
        data: { attemptsUsed: { increment: 1 } },
    });

    return res.json({
        correct: false,
        attemptsUsed: newAttempts,
        attemptsRemaining: puzzle.maxAttempts - newAttempts,
        message: `Wrong. ${puzzle.maxAttempts - newAttempts} attempts remaining.`,
    });
});

// ─── Reveal (Smith proves solvability after expiry) ────────

const revealSchema = z.object({
    answer: z.string().min(1).max(500),
});

router.post('/:id/reveal', authenticate, async (req, res) => {
    const parsed = revealSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { answer } = parsed.data;
    const puzzle = await prisma.puzzle.findUnique({ where: { id: req.params.id } });

    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    if (puzzle.smithId !== wallet.id) return res.status(403).json({ error: 'Only the smith can reveal.' });
    if (puzzle.status !== 'EXPIRED') return res.status(400).json({ error: `Puzzle is ${puzzle.status}, not expired.` });

    // Verify the revealed answer matches the stored hash
    const valid = verifyAnswer(answer, puzzle.answerType, puzzle.answerHash);
    if (!valid) {
        return res.status(400).json({ error: 'Revealed answer does not match the stored hash. Stake remains at risk.' });
    }

    // Valid reveal — smith gets stake back + smith reward
    const reward = puzzle.difficultyTier * config.game.smithRewardMultiplier;
    const totalReturn = puzzle.stake + reward;

    await prisma.$transaction([
        prisma.puzzle.update({
            where: { id: puzzle.id },
            data: {
                status: 'REVEALED',
                revealedAnswer: answer,
            },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: totalReturn },
                reputation: { increment: 1 },
            },
        }),
        prisma.transaction.create({
            data: {
                toId: wallet.id,
                amount: totalReturn,
                type: 'SMITH_REWARD',
                puzzleId: puzzle.id,
                memo: `Revealed. Stake ${puzzle.stake} returned + reward ${reward}`,
            },
        }),
    ]);

    logger.info({ puzzleId: puzzle.id, smith: wallet.name, totalReturn }, 'Puzzle revealed by smith');

    sse.broadcast('puzzle.revealed', {
        id: puzzle.id,
        title: puzzle.title,
        smith: wallet.name,
        answer,
    });

    res.json({
        revealed: true,
        answer,
        stakeReturned: puzzle.stake,
        reward,
        total: totalReturn,
        message: `Puzzle revealed. Stake returned + ${reward} reward.`,
    });
});

export default router;
