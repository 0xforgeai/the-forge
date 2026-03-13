import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCryptoPuzzle, isComputational } from '../crypto-puzzles.js';
import sse from '../sse.js';
import logger from '../logger.js';

const router = Router();
const bc = config.bout;
const burnCfg = config.burns;

// ─── List Bouts ────────────────────────────────────────────

router.get('/', async (req, res) => {
    const status = req.query.status;
    const where = status ? { status: status.toUpperCase() } : {};

    const bouts = await prisma.bout.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        take: 20,
        include: {
            entrants: {
                include: { wallet: { select: { name: true, xHandle: true, reputation: true } } },
            },
            bets: { select: { entrantId: true, amount: true } },
        },
    });

    const result = bouts.map(b => {
        // Calculate live odds from bet distribution
        const totalBets = b.bets.reduce((s, bet) => s + bet.amount, 0n);
        const betsByEntrant = {};
        b.bets.forEach(bet => {
            betsByEntrant[bet.entrantId] = (betsByEntrant[bet.entrantId] || 0n) + bet.amount;
        });

        return {
            id: b.id,
            title: b.title,
            puzzleType: b.puzzleType,
            tier: b.difficultyTier,
            status: b.status,
            scheduledAt: b.scheduledAt,
            registrationOpensAt: b.registrationOpensAt,
            bettingOpensAt: b.bettingOpensAt,
            bettingClosesAt: b.bettingClosesAt,
            liveAt: b.liveAt,
            resolvedAt: b.resolvedAt,
            entryFee: b.entryFee,
            solveDurationSecs: b.solveDurationSecs,
            prompt: b.status === 'LIVE' || b.status === 'RESOLVED' || b.status === 'RESOLVING' ? b.prompt : null,
            challengeData: b.status === 'LIVE' || b.status === 'RESOLVED' || b.status === 'RESOLVING' ? b.challengeData : null,
            entrants: b.entrants.map(e => ({
                id: e.id,
                agent: e.wallet.name,
                xHandle: e.wallet.xHandle,
                reputation: e.wallet.reputation,
                solved: e.solved,
                placement: e.placement,
                payout: e.payout,
                solveTime: e.solveTime,
                odds: totalBets > 0n ? (Number((betsByEntrant[e.id] || 0n) * 1000n / totalBets) / 10).toFixed(1) : '0.0',
                totalBetsOn: betsByEntrant[e.id] || 0n,
            })),
            totalEntrants: b.entrants.length,
            totalBetPool: totalBets,
            agentPurse: b.agentPurse,
            bettorPool: b.bettorPool,
        };
    });

    res.json({ bouts: result, total: result.length });
});

// ─── Bout Detail ───────────────────────────────────────────

router.get('/:id', async (req, res) => {
    const bout = await prisma.bout.findUnique({
        where: { id: req.params.id },
        include: {
            entrants: {
                include: { wallet: { select: { name: true, xHandle: true, reputation: true } } },
                orderBy: { placement: 'asc' },
            },
            bets: { select: { entrantId: true, amount: true, bettorId: true, payout: true } },
        },
    });
    if (!bout) return res.status(404).json({ error: 'Bout not found.' });

    const totalBets = bout.bets.reduce((s, b) => s + Number(b.amount), 0);
    const betsByEntrant = {};
    bout.bets.forEach(b => {
        betsByEntrant[b.entrantId] = (betsByEntrant[b.entrantId] || 0) + Number(b.amount);
    });

    res.json({
        id: bout.id,
        title: bout.title,
        puzzleType: bout.puzzleType,
        tier: bout.difficultyTier,
        status: bout.status,
        scheduledAt: bout.scheduledAt,
        registrationOpensAt: bout.registrationOpensAt,
        bettingOpensAt: bout.bettingOpensAt,
        bettingClosesAt: bout.bettingClosesAt,
        liveAt: bout.liveAt,
        resolvedAt: bout.resolvedAt,
        entryFee: bout.entryFee,
        solveDurationSecs: bout.solveDurationSecs,
        prompt: bout.status === 'LIVE' || bout.status === 'RESOLVED' || bout.status === 'RESOLVING' ? bout.prompt : null,
        challengeData: bout.status === 'LIVE' || bout.status === 'RESOLVED' || bout.status === 'RESOLVING' ? bout.challengeData : null,
        entrants: bout.entrants.map(e => ({
            id: e.id,
            agent: e.wallet.name,
            xHandle: e.wallet.xHandle,
            reputation: e.wallet.reputation,
            solved: e.solved,
            placement: e.placement,
            payout: e.payout,
            solveTime: e.solveTime,
            commitHash: e.commitHash ? true : false,  // don't reveal hash, just whether committed
            odds: totalBets > 0 ? ((betsByEntrant[e.id] || 0) / totalBets * 100).toFixed(1) : '0.0',
            totalBetsOn: betsByEntrant[e.id] || 0,
        })),
        totalEntrants: bout.entrants.length,
        totalBetPool: totalBets,
        totalEntryFees: bout.totalEntryFees,
        agentPurse: bout.agentPurse,
        bettorPool: bout.bettorPool,
        protocolRake: bout.protocolRake,
    });
});

// ─── Enter Bout ────────────────────────────────────────────

router.post('/:id/enter', authenticate, async (req, res) => {
    const wallet = req.wallet;
    const bout = await prisma.bout.findUnique({ where: { id: req.params.id } });
    if (!bout) return res.status(404).json({ error: 'Bout not found.' });

    // Must be in REGISTRATION or BETTING phase
    if (bout.status !== 'REGISTRATION' && bout.status !== 'BETTING') {
        return res.status(400).json({ error: `Bout is ${bout.status}. Registration is closed.` });
    }

    // Eligibility: account age
    const ageDays = (Date.now() - wallet.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < bc.minAccountAgeDays) {
        return res.status(400).json({
            error: `Account must be at least ${bc.minAccountAgeDays} days old. Yours is ${Math.floor(ageDays)} days.`,
        });
    }

    // Eligibility: minimum solves
    const solveCount = await prisma.solveAttempt.count({
        where: { solverId: wallet.id, correct: true },
    });
    if (solveCount < bc.minSolvesToEnter) {
        return res.status(400).json({
            error: `Must have solved ${bc.minSolvesToEnter}+ puzzles in the open arena. You have ${solveCount}.`,
        });
    }

    // Eligibility: balance
    if (wallet.balance < bc.minBalanceToEnter) {
        return res.status(400).json({
            error: `Minimum balance of ${bc.minBalanceToEnter} $FORGE required. You have ${wallet.balance}.`,
        });
    }

    // Check balance for entry fee
    if (wallet.balance < bout.entryFee) {
        return res.status(400).json({
            error: `Insufficient balance for ${bout.entryFee} entry fee. You have ${wallet.balance}.`,
        });
    }

    // Already entered?
    const existing = await prisma.boutEntrant.findUnique({
        where: { boutId_walletId: { boutId: bout.id, walletId: wallet.id } },
    });
    if (existing) {
        return res.status(400).json({ error: 'You are already entered in this bout.' });
    }

    // Enter + deduct fee + burn 10%
    const burnAmount = bout.entryFee * BigInt(burnCfg.entryFeePercent) / 100n;
    const netEntryFee = bout.entryFee - burnAmount;

    const [entrant] = await prisma.$transaction([
        prisma.boutEntrant.create({
            data: { boutId: bout.id, walletId: wallet.id, entryFeePaid: bout.entryFee },
        }),
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: bout.entryFee } },
        }),
        prisma.bout.update({
            where: { id: bout.id },
            data: { totalEntryFees: { increment: netEntryFee } },
        }),
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: bout.entryFee,
                type: 'BOUT_ENTRY',
                boutId: bout.id,
                memo: `Entry fee for bout: ${bout.title}`,
            },
        }),
        // H-6 fix: Track burn as a proper BURN transaction for supply accounting
        prisma.transaction.create({
            data: {
                fromId: wallet.id,
                amount: burnAmount,
                type: 'BURN',
                boutId: bout.id,
                memo: `Entry fee burn (${burnCfg.entryFeePercent}%): ${bout.title}`,
            },
        }),
        // Also record in treasury ledger for audit trail
        prisma.treasuryLedger.create({
            data: {
                action: 'ENTRY_FEE_BURN',
                amount: burnAmount,
                memo: `Burned ${burnAmount} from ${wallet.name}'s entry fee (${burnCfg.entryFeePercent}%)`,
            },
        }),
    ]);

    logger.info({ boutId: bout.id, agent: wallet.name }, 'Agent entered bout');

    sse.broadcast('bout.entry', {
        boutId: bout.id,
        agent: wallet.name,
        entrantId: entrant.id,
        totalEntrants: await prisma.boutEntrant.count({ where: { boutId: bout.id } }),
    });

    res.status(201).json({
        entrantId: entrant.id,
        boutId: bout.id,
        entryFeePaid: bout.entryFee,
        burned: burnAmount,
        message: `Entered "${bout.title}". Entry fee: ${bout.entryFee} $FORGE (${burnAmount} burned).`,
    });
});

// ─── Place Bet ─────────────────────────────────────────────

const betSchema = z.object({
    entrantId: z.string().uuid(),
    amount: z.number().int().min(10),
});

router.post('/:id/bet', authenticate, async (req, res) => {
    const parsed = betSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { entrantId, amount } = parsed.data;
    const bout = await prisma.bout.findUnique({ where: { id: req.params.id } });
    if (!bout) return res.status(404).json({ error: 'Bout not found.' });

    // Must be in BETTING phase
    if (bout.status !== 'BETTING') {
        return res.status(400).json({ error: `Bout is ${bout.status}. Betting is not open.` });
    }

    // Cannot bet on bout you're entered in
    const isEntrant = await prisma.boutEntrant.findUnique({
        where: { boutId_walletId: { boutId: bout.id, walletId: wallet.id } },
    });
    if (isEntrant) {
        return res.status(400).json({ error: 'Cannot bet on a bout you are competing in.' });
    }

    // Entrant must exist
    const entrant = await prisma.boutEntrant.findUnique({ where: { id: entrantId } });
    if (!entrant || entrant.boutId !== bout.id) {
        return res.status(400).json({ error: 'Entrant not found in this bout.' });
    }

    // One bet per wallet per bout
    const existingBet = await prisma.bet.findUnique({
        where: { boutId_bettorId: { boutId: bout.id, bettorId: wallet.id } },
    });
    if (existingBet) {
        return res.status(400).json({ error: 'You already placed a bet on this bout. One bet per bout.' });
    }

    // Check balance (preliminary — re-checked inside transaction)
    if (wallet.balance < BigInt(amount)) {
        return res.status(400).json({ error: `Insufficient balance. Need ${amount}, have ${wallet.balance}.` });
    }

    // Place bet atomically with max bet check (C-5 fix: serialized read-check-write)
    const amountBig = BigInt(amount);
    const betBurn = amountBig * BigInt(burnCfg.betPercent) / 100n;
    const netBetAmount = amountBig - betBurn;

    let bet;
    try {
        const result = await prisma.$transaction(async (tx) => {
            // Re-read bout inside transaction for atomic max bet check
            const freshBout = await tx.bout.findUnique({ where: { id: bout.id } });
            if (!freshBout || freshBout.status !== 'BETTING') {
                throw new Error('BOUT_NOT_BETTING');
            }

            const currentPool = freshBout.totalBetPool + netBetAmount;
            const maxBet = currentPool * BigInt(bc.maxBetPercent) / 100n;
            const effectiveMax = maxBet > 100n ? maxBet : 100n;
            if (amountBig > effectiveMax) {
                throw new Error(`MAX_BET:${effectiveMax}`);
            }

            // Re-check balance inside transaction
            const freshWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
            if (!freshWallet || freshWallet.balance < amountBig) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            const createdBet = await tx.bet.create({
                data: { boutId: bout.id, bettorId: wallet.id, entrantId, amount: netBetAmount },
            });

            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: { decrement: amountBig } },
            });

            await tx.bout.update({
                where: { id: bout.id },
                data: { totalBetPool: { increment: netBetAmount } },
            });

            await tx.transaction.create({
                data: {
                    fromId: wallet.id,
                    amount: amountBig,
                    type: 'BOUT_BET',
                    boutId: bout.id,
                    memo: `Bet on entrant in: ${bout.title} (${betBurn} burned)`,
                },
            });

            await tx.treasuryLedger.create({
                data: {
                    action: 'BET_BURN',
                    amount: betBurn,
                    memo: `Burned ${betBurn} from ${wallet.name}'s bet (${burnCfg.betPercent}%)`,
                },
            });

            return createdBet;
        });
        bet = result;
    } catch (err) {
        if (err.message === 'BOUT_NOT_BETTING') {
            return res.status(400).json({ error: 'Bout is no longer in BETTING phase.' });
        }
        if (err.message?.startsWith('MAX_BET:')) {
            const maxBet = err.message.split(':')[1];
            return res.status(400).json({
                error: `Max bet is ${maxBet} (${bc.maxBetPercent}% of pool). You tried ${amount}.`,
            });
        }
        if (err.message === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ error: `Insufficient balance.` });
        }
        throw err;
    }

    logger.info({ boutId: bout.id, bettor: wallet.name, amount, entrantId }, 'Bet placed');

    sse.broadcast('bout.bet', {
        boutId: bout.id,
        totalBetPool: bout.totalBetPool + amountBig,
    });

    res.status(201).json({
        betId: bet.id,
        boutId: bout.id,
        entrantId,
        amount: netBetAmount,
        burned: betBurn,
        message: `Bet ${amount} $FORGE placed (${betBurn} burned, ${netBetAmount} in pool).`,
    });
});

// ─── Commit (submit hashed answer) ─────────────────────────

const commitSchema = z.object({
    commitHash: z.string().min(16).max(128),
});

router.post('/:id/commit', authenticate, async (req, res) => {
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { commitHash } = parsed.data;
    const bout = await prisma.bout.findUnique({ where: { id: req.params.id } });
    if (!bout) return res.status(404).json({ error: 'Bout not found.' });
    if (bout.status !== 'LIVE') return res.status(400).json({ error: `Bout is ${bout.status}, not live.` });

    // Must be entrant
    const entrant = await prisma.boutEntrant.findUnique({
        where: { boutId_walletId: { boutId: bout.id, walletId: wallet.id } },
    });
    if (!entrant) return res.status(403).json({ error: 'You are not entered in this bout.' });
    if (entrant.commitHash) return res.status(400).json({ error: 'You already committed an answer.' });

    // Check time window
    const elapsed = Math.floor((Date.now() - bout.liveAt.getTime()) / 1000);
    if (elapsed > bout.solveDurationSecs) {
        return res.status(400).json({ error: 'Solve window has expired.' });
    }

    // H-7 fix: Enforce 60-second buffer before solve window close
    // Prevents the late-commit-no-risk exploit where agents commit at the last second
    const COMMIT_BUFFER_SECS = 60;
    const remaining = bout.solveDurationSecs - elapsed;
    if (remaining < COMMIT_BUFFER_SECS) {
        return res.status(400).json({
            error: `Commits must be submitted at least ${COMMIT_BUFFER_SECS}s before the solve window closes. Only ${remaining}s remaining.`,
        });
    }

    await prisma.boutEntrant.update({
        where: { id: entrant.id },
        data: { commitHash, committedAt: new Date() },
    });

    logger.info({ boutId: bout.id, agent: wallet.name, elapsed }, 'Commit received');

    sse.broadcast('bout.commit', {
        boutId: bout.id,
        agent: wallet.name,
        elapsed,
    });

    res.json({
        committed: true,
        elapsed,
        message: `Commit received at ${elapsed}s. Wait for reveal phase.`,
    });
});

// ─── Reveal (submit actual answer) ─────────────────────────

const revealSchema = z.object({
    answer: z.string().min(1).max(10000),
    secret: z.string().min(1).max(256),
});

router.post('/:id/reveal', authenticate, async (req, res) => {
    const parsed = revealSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { answer, secret } = parsed.data;
    const bout = await prisma.bout.findUnique({ where: { id: req.params.id } });
    if (!bout) return res.status(404).json({ error: 'Bout not found.' });
    if (bout.status !== 'LIVE' && bout.status !== 'RESOLVING') {
        return res.status(400).json({ error: `Bout is ${bout.status}. Cannot reveal now.` });
    }

    const entrant = await prisma.boutEntrant.findUnique({
        where: { boutId_walletId: { boutId: bout.id, walletId: wallet.id } },
    });
    if (!entrant) return res.status(403).json({ error: 'You are not entered in this bout.' });
    if (!entrant.commitHash) return res.status(400).json({ error: 'You never committed. Cannot reveal.' });
    if (entrant.revealedAnswer) return res.status(400).json({ error: 'You already revealed.' });

    // Verify commit hash matches: SHA-256(answer + secret)
    const expectedHash = crypto.createHash('sha256').update(answer + secret).digest('hex');
    if (expectedHash !== entrant.commitHash) {
        return res.status(400).json({ error: 'Reveal does not match your commit hash. Cheating detected.' });
    }

    // Verify correctness against the puzzle
    const correct = verifyCryptoPuzzle(answer, bout.puzzleType, bout.challengeData, bout.answerHash);
    const solveTime = entrant.committedAt
        ? Math.floor((entrant.committedAt.getTime() - bout.liveAt.getTime()) / 1000)
        : null;

    await prisma.boutEntrant.update({
        where: { id: entrant.id },
        data: {
            revealedAnswer: answer,
            revealedAt: new Date(),
            solved: correct,
            solveTime: correct ? solveTime : null,
        },
    });

    logger.info({ boutId: bout.id, agent: wallet.name, correct, solveTime }, 'Reveal received');

    if (correct) {
        sse.broadcast('bout.solved', {
            boutId: bout.id,
            agent: wallet.name,
            solveTime,
        });
    }

    res.json({
        revealed: true,
        correct,
        solveTime: correct ? solveTime : null,
        message: correct
            ? `Correct! Solved in ${solveTime}s. Awaiting bout resolution.`
            : 'Incorrect answer. Better luck next bout.',
    });
});

// ─── Results ───────────────────────────────────────────────

router.get('/:id/results', async (req, res) => {
    const bout = await prisma.bout.findUnique({
        where: { id: req.params.id },
        include: {
            entrants: {
                include: { wallet: { select: { name: true } } },
                orderBy: { placement: 'asc' },
            },
            bets: {
                include: { bettor: { select: { name: true } } },
            },
        },
    });

    if (!bout) return res.status(404).json({ error: 'Bout not found.' });
    if (bout.status !== 'RESOLVED') {
        return res.status(400).json({ error: `Bout is ${bout.status}, not yet resolved.` });
    }

    const podium = bout.entrants
        .filter(e => e.placement != null)
        .sort((a, b) => a.placement - b.placement)
        .map(e => ({
            placement: e.placement,
            agent: e.wallet.name,
            solveTime: e.solveTime,
            payout: e.payout,
        }));

    const bettorResults = bout.bets.map(b => ({
        bettor: b.bettor.name,
        amount: b.amount,
        payout: b.payout,
        profit: b.payout - b.amount,
    }));

    res.json({
        boutId: bout.id,
        title: bout.title,
        totalEntrants: bout.entrants.length,
        totalBetPool: bout.totalBetPool,
        totalEntryFees: bout.totalEntryFees,
        protocolRake: bout.protocolRake,
        agentPurse: bout.agentPurse,
        bettorPool: bout.bettorPool,
        podium,
        bettorResults,
    });
});

export default router;
