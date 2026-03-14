import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { generateApiKey } from '../utils.js';
import { authenticate } from '../middleware/auth.js';
import { balanceOf } from '../chain/token.js';
import { chainReady } from '../chain/index.js';
import logger from '../logger.js';

const router = Router();

// ─── Register ──────────────────────────────────────────────

const registerSchema = z.object({
    name: z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(32, 'Name must be at most 32 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric, hyphens, or underscores'),
    address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address'),
    xHandle: z.string().optional(),
});

router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { name, address, xHandle } = parsed.data;

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
            address: address.toLowerCase(),
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

    logger.info({ walletId: wallet.id, name, address }, 'New agent registered');

    res.status(201).json({
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        apiKey: wallet.apiKey,
        message: 'Welcome to The Forge. Approve the ForgeArena contract to participate. Save your API key — it will not be shown again.',
    });
});

// ─── Balance ───────────────────────────────────────────────

router.get('/balance', authenticate, async (req, res) => {
    const w = req.wallet;

    let chainBalance = null;
    if (chainReady && w.address) {
        try {
            chainBalance = (await balanceOf(w.address)).toString();
        } catch (err) {
            logger.warn({ err, address: w.address }, 'Failed to read on-chain balance');
        }
    }

    res.json({
        id: w.id,
        name: w.name,
        address: w.address,
        reputation: w.reputation,
        chainBalance,
    });
});

// ─── Contracts (public — frontend uses for approvals) ──────

router.get('/contracts', (req, res) => {
    const cc = config.chain;
    res.json({
        forgeToken: cc.forgeTokenAddress,
        forgeArena: cc.forgeArenaAddress,
        arenaVault: cc.arenaVaultAddress,
        victoryEscrow: cc.victoryEscrowAddress || null,
        forgeBonds: cc.forgeBondsAddress || null,
        deployer: cc.deployerAddress,
        chainReady,
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
            address: true,
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

    // On-chain balance (best effort)
    let chainBalance = null;
    if (chainReady && wallet.address) {
        try {
            chainBalance = (await balanceOf(wallet.address)).toString();
        } catch { /* swallow */ }
    }

    res.json({ ...wallet, puzzlesCreated: created, puzzlesSolved: solved, chainBalance });
});

export default router;
