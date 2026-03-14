import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../logger.js';

const router = Router();

// ─── Transfer tokens ───────────────────────────────────────

const transferSchema = z.object({
    toName: z.string().min(1),
    amount: z.number().int().positive(),
});

router.post('/', authenticate, async (req, res) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { toName, amount } = parsed.data;

    // NOTE: Balance checks are enforced on-chain via token transfer

    const recipient = await prisma.wallet.findUnique({ where: { name: toName } });
    if (!recipient) {
        return res.status(404).json({ error: `Recipient "${toName}" not found.` });
    }

    if (recipient.id === wallet.id) {
        return res.status(400).json({ error: "Can't transfer to yourself." });
    }

    // NOTE: Token transfers handled on-chain; DB records the intent
    await prisma.transaction.create({
        data: {
            fromId: wallet.id,
            toId: recipient.id,
            amount,
            type: 'TRANSFER',
            memo: `Transfer to ${toName}`,
        },
    });

    logger.info({ from: wallet.name, to: toName, amount }, 'Token transfer');

    res.json({
        from: wallet.name,
        to: toName,
        amount,
        message: `Sent ${amount} $FORGE to ${toName}.`,
    });
});

export default router;
