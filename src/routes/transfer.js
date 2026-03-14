import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import prisma from '../db.js';
import config from '../config.js';
import { authenticate, requireChain } from '../middleware/auth.js';
import logger from '../logger.js';
import { forgeToken } from '../chain/index.js';
import { submitTx } from '../chain/tx.js';
import { balanceOf } from '../chain/token.js';

const router = Router();

// ─── Transfer tokens ───────────────────────────────────────

const transferSchema = z.object({
    toName: z.string().min(1),
    amount: z.number().int().positive(),
});

router.post('/', authenticate, requireChain, async (req, res) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const wallet = req.wallet;
    const { toName, amount } = parsed.data;

    if (!wallet.address) {
        return res.status(400).json({ error: 'No on-chain address linked. Register with an address.' });
    }

    const recipient = await prisma.wallet.findUnique({ where: { name: toName } });
    if (!recipient) {
        return res.status(404).json({ error: `Recipient "${toName}" not found.` });
    }
    if (!recipient.address) {
        return res.status(400).json({ error: `Recipient "${toName}" has no on-chain address.` });
    }
    if (recipient.id === wallet.id) {
        return res.status(400).json({ error: "Can't transfer to yourself." });
    }

    // On-chain balance check
    const amountWei = ethers.parseEther(amount.toString());
    const onChainBalance = await balanceOf(wallet.address);
    if (onChainBalance < amountWei) {
        return res.status(400).json({
            error: `Insufficient on-chain balance. Need ${amount} $FORGE, have ${ethers.formatEther(onChainBalance)}.`,
        });
    }

    // On-chain: transfer from sender to recipient
    // Sender must have approved the deployer (relay) for the transfer amount
    let txHash;
    try {
        const receipt = await submitTx(
            () => forgeToken.transferFrom(wallet.address, recipient.address, amountWei),
            `transfer(${wallet.name} → ${toName}, ${amount})`,
        );
        txHash = receipt.hash;
    } catch (err) {
        logger.error({ err, from: wallet.name, to: toName, amount }, 'On-chain transfer failed');
        const msg = err?.message || '';
        if (msg.includes('CALL_EXCEPTION') || msg.includes('revert')) {
            return res.status(400).json({
                error: 'On-chain transfer failed. Ensure you have approved the relay for the transfer amount.',
            });
        }
        return res.status(500).json({ error: 'On-chain transaction failed. Try again.' });
    }

    // DB cache record (after chain succeeds)
    await prisma.transaction.create({
        data: {
            fromId: wallet.id,
            toId: recipient.id,
            amount,
            type: 'TRANSFER',
            memo: `Transfer to ${toName} (tx: ${txHash})`,
        },
    });

    logger.info({ from: wallet.name, to: toName, amount, txHash }, 'Token transfer (on-chain)');

    res.json({
        from: wallet.name,
        to: toName,
        amount,
        txHash,
        message: `Sent ${amount} $FORGE to ${toName}.`,
    });
});

export default router;
