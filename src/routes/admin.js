import { Router } from 'express';
import prisma from '../db.js';
import { adminAuth } from '../middleware/auth.js';
import config from '../config.js';

const router = Router();

// All admin routes require basic auth
router.use(adminAuth(config.admin.user, config.admin.pass));

// ─── Dashboard Stats ───────────────────────────────────────

router.get('/stats', async (req, res) => {
    const [wallets, puzzles, transactions] = await Promise.all([
        prisma.wallet.count(),
        prisma.puzzle.groupBy({
            by: ['status'],
            _count: true,
        }),
        prisma.transaction.aggregate({
            _count: true,
            _sum: { amount: true },
        }),
    ]);

    res.json({
        wallets,
        puzzlesByStatus: Object.fromEntries(puzzles.map((p) => [p.status, p._count])),
        totalTransactions: transactions._count,
        totalVolume: transactions._sum.amount || 0,
    });
});

// ─── List All Puzzles (including answers) ──────────────────

router.get('/puzzles', async (req, res) => {
    const puzzles = await prisma.puzzle.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            smith: { select: { name: true } },
            solver: { select: { name: true } },
        },
    });

    res.json({ puzzles });
});

// ─── View Puzzle Detail with Answer Hash ───────────────────

router.get('/puzzles/:id', async (req, res) => {
    const puzzle = await prisma.puzzle.findUnique({
        where: { id: req.params.id },
        include: {
            smith: { select: { name: true, apiKey: false } },
            solver: { select: { name: true } },
            solveAttempts: true,
            transactions: true,
        },
    });

    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
    res.json(puzzle);
});

// ─── List All Wallets ──────────────────────────────────────

router.get('/wallets', async (req, res) => {
    const wallets = await prisma.wallet.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            name: true,
            xHandle: true,
            balance: true,
            gas: true,
            reputation: true,
            createdAt: true,
            // Never expose API keys, not even to admin
        },
    });

    res.json({ wallets });
});

// ─── Adjust Wallet Balance (dispute resolution) ────────────

router.post('/wallets/:id/adjust', async (req, res) => {
    const { amount, memo } = req.body;
    if (typeof amount !== 'number' || !memo) {
        return res.status(400).json({ error: 'Provide numeric amount and memo.' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: req.params.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });

    await prisma.$transaction([
        prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
        }),
        prisma.transaction.create({
            data: {
                toId: amount > 0 ? wallet.id : undefined,
                fromId: amount < 0 ? wallet.id : undefined,
                amount: Math.abs(amount),
                type: 'TRANSFER',
                memo: `[ADMIN] ${memo}`,
            },
        }),
    ]);

    res.json({
        wallet: wallet.name,
        adjustment: amount,
        newBalance: wallet.balance + amount,
        memo,
    });
});

// ─── Force-expire a puzzle ─────────────────────────────────

router.post('/puzzles/:id/force-expire', async (req, res) => {
    const puzzle = await prisma.puzzle.findUnique({ where: { id: req.params.id } });
    if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });

    await prisma.puzzle.update({
        where: { id: puzzle.id },
        data: {
            status: 'EXPIRED',
            expiredAt: new Date(),
            revealDeadline: new Date(Date.now() + config.game.revealDeadlineSeconds * 1000),
        },
    });

    res.json({ message: `Puzzle ${puzzle.id} force-expired.` });
});

export default router;
