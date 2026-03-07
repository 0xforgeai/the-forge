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

    if (wallet.gas < config.game.gasCostTransfer) {
        return res.status(400).json({ error: `Insufficient gas. Need ${config.game.gasCostTransfer}, have ${wallet.gas}.` });
    }

    if (wallet.balance < amount) {
        return res.status(400).json({ error: `Insufficient balance. Have ${wallet.balance}, need ${amount}.` });
    }

    const recipient = await prisma.wallet.findUnique({ where: { name: toName } });
    if (!recipient) {
        return res.status(404).json({ error: `Recipient "${toName}" not found.` });
    }

    if (recipient.id === wallet.id) {
        return res.status(400).json({ error: "Can't transfer to yourself." });
    }

    // H-8 fix: use interactive transaction and return updated balance
    const updatedSender = await prisma.$transaction(async (tx) => {
        const sender = await tx.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { decrement: amount },
                gas: { decrement: config.game.gasCostTransfer },
            },
        });

        await tx.wallet.update({
            where: { id: recipient.id },
            data: { balance: { increment: amount } },
        });

        await tx.transaction.create({
            data: {
                fromId: wallet.id,
                toId: recipient.id,
                amount,
                type: 'TRANSFER',
                memo: `Transfer to ${toName}`,
            },
        });

        await tx.transaction.create({
            data: {
                fromId: wallet.id,
                amount: config.game.gasCostTransfer,
                type: 'GAS_SPEND',
                memo: 'Gas: transfer',
            },
        });

        return sender;
    });

    logger.info({ from: wallet.name, to: toName, amount }, 'Token transfer');

    res.json({
        from: wallet.name,
        to: toName,
        amount,
        newBalance: updatedSender.balance,
        message: `Sent ${amount} $FORGE to ${toName}.`,
    });
});

export default router;
