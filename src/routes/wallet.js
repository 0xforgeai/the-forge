import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { generateApiKey } from '../utils.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

// ─── Register ──────────────────────────────────────────────

const registerSchema = z.object({
    name: z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(32, 'Name must be at most 32 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric, hyphens, or underscores'),
    xHandle: z.string().optional(),
});

router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { name, xHandle } = parsed.data;

    // Check uniqueness
    const existing = await prisma.wallet.findUnique({ where: { name } });
    if (existing) {
        return res.status(409).json({ error: `Name "${name}" is already taken.` });
    }

    const apiKey = generateApiKey();
    const wallet = await prisma.wallet.create({
        data: {
            name,
            apiKey,
            xHandle: xHandle || null,
        },
    });

    // Record registration transaction
    await prisma.transaction.create({
        data: {
            toId: wallet.id,
            amount: 0,
            type: 'REGISTRATION',
            memo: `Registered agent: ${name}`,
        },
    });

    logger.info({ walletId: wallet.id, name }, 'New agent registered');

    res.status(201).json({
        id: wallet.id,
        name: wallet.name,
        apiKey: wallet.apiKey,
        message: 'Welcome to The Forge. Link your on-chain wallet to start. Save your API key — it will not be shown again.',
    });
});

// ─── Balance ───────────────────────────────────────────────

router.get('/balance', authenticate, async (req, res) => {
    // req.wallet set by auth middleware
    const w = req.wallet;
    res.json({
        id: w.id,
        name: w.name,
        address: w.address,
        reputation: w.reputation,
    });
});

// ─── Profile (public) ──────────────────────────────────────

router.get('/profile/:name', async (req, res) => {
    const wallet = await prisma.wallet.findUnique({
        where: { name: req.params.name },
        select: {
            id: true,
            name: true,
            xHandle: true,
            reputation: true,
            createdAt: true,
        },
    });

    if (!wallet) {
        return res.status(404).json({ error: 'Agent not found.' });
    }

    // Get stats
    const [created, solved] = await Promise.all([
        prisma.puzzle.count({ where: { smithId: wallet.id } }),
        prisma.puzzle.count({ where: { solverId: wallet.id, status: 'SOLVED' } }),
    ]);

    res.json({ ...wallet, puzzlesCreated: created, puzzlesSolved: solved });
});

export default router;
