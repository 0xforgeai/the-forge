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
    const registrationBurn = config.burns.registrationBurn; // M-11 fix: apply documented 50 token burn
    const startingBalance = config.game.initialBalance - registrationBurn;

    const wallet = await prisma.wallet.create({
        data: {
            name,
            apiKey,
            xHandle: xHandle || null,
            balance: startingBalance,
            gas: config.game.initialGas,
        },
    });

    // Record registration transaction + burn
    await prisma.$transaction([
        prisma.transaction.create({
            data: {
                toId: wallet.id,
                amount: startingBalance,
                type: 'REGISTRATION',
                memo: `Registered agent: ${name} (${registrationBurn} burned at registration)`,
            },
        }),
        prisma.treasuryLedger.create({
            data: {
                action: 'REGISTRATION_BURN',
                amount: registrationBurn,
                memo: `Registration burn: ${name}`,
            },
        }),
    ]);

    logger.info({ walletId: wallet.id, name }, 'New agent registered');

    res.status(201).json({
        id: wallet.id,
        name: wallet.name,
        apiKey: wallet.apiKey,
        balance: startingBalance,
        gas: wallet.gas,
        registrationBurn,
        message: `Welcome to The Forge. ${registrationBurn} $FORGE burned at registration. Save your API key — it will not be shown again.`,
    });
});

// ─── Balance ───────────────────────────────────────────────

router.get('/balance', authenticate, async (req, res) => {
    // req.wallet set by auth middleware
    const w = req.wallet;
    res.json({
        id: w.id,
        name: w.name,
        balance: w.balance,
        gas: w.gas,
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
            balance: true,
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
