/**
 * Bankr Router — Natural Language Command Interface
 *
 * POST /api/bankr/command
 *   Body: { message: "stake 5000 FORGE in Obsidian" }
 *   Response: { intent, params, result?, txParams? }
 *
 * Uses Bankr Router's OpenAI-compatible API to parse natural language
 * into structured Forge actions. Read-only actions execute immediately.
 * Write actions return tx params for the frontend to sign.
 */

import { Router } from 'express';
import { ethers } from 'ethers';
import { authenticate } from '../middleware/auth.js';
import { chainReady, arenaVault, forgeArena, forgeToken, uuidToBytes32 } from '../chain/index.js';
import * as vaultChain from '../chain/vault.js';
import prisma from '../db.js';
import logger from '../logger.js';
import config from '../config.js';

const router = Router();

// ─── Bankr Router Config ────────────────────────────────────

const BANKR_URL = process.env.BANKR_URL || 'http://127.0.0.1:8787/v1';
const BANKR_KEY = process.env.BANKR_API_KEY || 'local-router';
const BANKR_MODEL = process.env.BANKR_MODEL || 'bankr-router/auto';

// ─── Available Forge Actions (tool definitions for LLM) ─────

const FORGE_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_position',
            description: 'Get a user\'s staking position in the Covenant Vault, including staked amount, covenant type, claimable yield, and lock status.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_balance',
            description: 'Get the user\'s $FORGE token balance.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_vault_stats',
            description: 'Get global vault statistics: total staked, number of stakers, total burned.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'stake',
            description: 'Stake $FORGE tokens in the Covenant Vault. Covenants: FLAME (1 day lock), STEEL (3 days, +50% APY), OBSIDIAN (7 days, +150% APY), ETERNAL (30 days, +300% APY, no unstake).',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Amount of $FORGE to stake' },
                    covenant: {
                        type: 'string',
                        enum: ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'],
                        description: 'Covenant tier to stake in',
                    },
                },
                required: ['amount', 'covenant'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'unstake',
            description: 'Unstake (rage quit) from the Covenant Vault. May incur rage quit tax if within lock period.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'claim_yield',
            description: 'Claim accumulated staking yield from the Covenant Vault.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'enter_bout',
            description: 'Enter a scheduled bout (competitive trial). Pays entry fee on-chain.',
            parameters: {
                type: 'object',
                properties: {
                    bout_id: { type: 'string', description: 'Bout ID or "next" for the next available bout' },
                },
                required: ['bout_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'place_bet',
            description: 'Place a bet on an agent in a bout.',
            parameters: {
                type: 'object',
                properties: {
                    bout_id: { type: 'string', description: 'Bout ID' },
                    agent: { type: 'string', description: 'Agent name or index number' },
                    amount: { type: 'number', description: 'Amount of $FORGE to bet' },
                },
                required: ['bout_id', 'agent', 'amount'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_bouts',
            description: 'List upcoming and active bouts.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_leaderboard',
            description: 'Get the agent leaderboard rankings.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
];

const SYSTEM_PROMPT = `You are the Forge Assistant, an AI that helps users interact with The Forge — an AI gladiator arena on Base blockchain.

You have access to tools for staking, betting, entering bouts, and querying data. When a user gives you a command, call the appropriate tool.

Key knowledge:
- $FORGE is the native token on Base
- The Covenant Vault lets users stake $FORGE with different lock tiers (FLAME/STEEL/OBSIDIAN/ETERNAL)
- Bouts are competitive trials where AI agents solve puzzles
- Users can bet on agents in bouts

Always be concise. Use the tools to fulfill user requests. If a command is ambiguous, ask for clarification by responding without a tool call.`;

// ─── Covenant mapping ───────────────────────────────────────

const COVENANT_MAP = { FLAME: 0, STEEL: 1, OBSIDIAN: 2, ETERNAL: 3 };

// ─── Action Executor ────────────────────────────────────────

async function executeAction(toolName, args, walletAddress) {
    switch (toolName) {
        // ── Read Actions (execute immediately) ──

        case 'get_position': {
            if (!chainReady) return { type: 'read', data: null, message: 'Chain not connected' };
            const pos = await vaultChain.getPosition(walletAddress);
            const claimable = await vaultChain.getClaimable(walletAddress);
            const covenants = ['FLAME', 'STEEL', 'OBSIDIAN', 'ETERNAL'];
            return {
                type: 'read',
                data: {
                    active: pos.active,
                    covenant: covenants[Number(pos.covenant)] || 'UNKNOWN',
                    staked: ethers.formatEther(pos.amount),
                    claimableYield: ethers.formatEther(claimable),
                    lockExpires: new Date(Number(pos.lockExpiresAt) * 1000).toISOString(),
                    totalEarned: ethers.formatEther(pos.totalEarned),
                },
                message: pos.active
                    ? `You have ${ethers.formatEther(pos.amount)} $FORGE staked in ${covenants[Number(pos.covenant)]}. Claimable yield: ${ethers.formatEther(claimable)} $FORGE.`
                    : 'You have no active stake.',
            };
        }

        case 'get_balance': {
            if (!chainReady) return { type: 'read', data: null, message: 'Chain not connected' };
            const bal = await forgeToken.balanceOf(walletAddress);
            return {
                type: 'read',
                data: { balance: ethers.formatEther(bal) },
                message: `Your balance: ${Number(ethers.formatEther(bal)).toLocaleString()} $FORGE`,
            };
        }

        case 'get_vault_stats': {
            if (!chainReady) return { type: 'read', data: null, message: 'Chain not connected' };
            const [total, count] = await Promise.all([
                vaultChain.totalStaked(),
                vaultChain.activeStakerCount(),
            ]);
            return {
                type: 'read',
                data: {
                    totalStaked: ethers.formatEther(total),
                    stakerCount: Number(count),
                },
                message: `Vault: ${Number(ethers.formatEther(total)).toLocaleString()} $FORGE staked by ${Number(count)} stakers.`,
            };
        }

        case 'list_bouts': {
            const bouts = await prisma.bout.findMany({
                where: { status: { in: ['SCHEDULED', 'REGISTRATION', 'BETTING', 'LIVE'] } },
                orderBy: { scheduledAt: 'asc' },
                take: 5,
            });
            return {
                type: 'read',
                data: bouts.map(b => ({
                    id: b.id,
                    title: b.title,
                    status: b.status,
                    scheduledAt: b.scheduledAt?.toISOString(),
                    entryFee: b.entryFee,
                })),
                message: bouts.length > 0
                    ? `Upcoming bouts:\n${bouts.map(b => `• ${b.title} — ${b.status} (${b.scheduledAt?.toLocaleDateString()})`).join('\n')}`
                    : 'No upcoming bouts scheduled.',
            };
        }

        case 'get_leaderboard': {
            const top = await prisma.wallet.findMany({
                orderBy: { reputation: 'desc' },
                take: 10,
                select: { name: true, reputation: true, totalSolved: true },
            });
            return {
                type: 'read',
                data: top,
                message: top.length > 0
                    ? `Top agents:\n${top.map((a, i) => `${i + 1}. ${a.name} — Rep: ${a.reputation}, Solved: ${a.totalSolved}`).join('\n')}`
                    : 'No agents on the leaderboard yet.',
            };
        }

        // ── Write Actions (return tx params for client-side signing) ──

        case 'stake': {
            const amount = args.amount;
            const covenant = COVENANT_MAP[args.covenant?.toUpperCase()] ?? 0;
            const amountWei = ethers.parseEther(amount.toString());
            return {
                type: 'write',
                intent: 'stake',
                params: { amount, covenant: args.covenant, covenantId: covenant },
                txSteps: [
                    {
                        label: `Approve ${amount.toLocaleString()} $FORGE`,
                        contract: 'FORGE_TOKEN',
                        method: 'approve',
                        args: [config.chain.arenaVaultAddress, amountWei.toString()],
                    },
                    {
                        label: `Stake ${amount.toLocaleString()} $FORGE in ${args.covenant}`,
                        contract: 'ARENA_VAULT',
                        method: 'stake',
                        args: [amountWei.toString(), covenant],
                    },
                ],
                message: `Ready to stake ${amount.toLocaleString()} $FORGE in ${args.covenant} covenant. Confirm the transaction in your wallet.`,
            };
        }

        case 'unstake': {
            return {
                type: 'write',
                intent: 'unstake',
                params: {},
                txSteps: [
                    {
                        label: 'Unstake (Rage Quit)',
                        contract: 'ARENA_VAULT',
                        method: 'unstake',
                        args: [],
                    },
                ],
                message: 'Ready to unstake. Warning: early unstaking incurs a rage quit tax. Confirm in your wallet.',
            };
        }

        case 'claim_yield': {
            return {
                type: 'write',
                intent: 'claim_yield',
                params: {},
                txSteps: [
                    {
                        label: 'Claim Staking Yield',
                        contract: 'ARENA_VAULT',
                        method: 'claimYield',
                        args: [],
                    },
                ],
                message: 'Ready to claim your staking yield. Confirm in your wallet.',
            };
        }

        case 'enter_bout': {
            let boutId = args.bout_id;
            if (boutId === 'next') {
                const next = await prisma.bout.findFirst({
                    where: { status: { in: ['REGISTRATION', 'BETTING'] } },
                    orderBy: { scheduledAt: 'asc' },
                });
                if (!next) return { type: 'read', message: 'No bouts open for entry right now.' };
                boutId = next.id;
            }
            const bout = await prisma.bout.findUnique({ where: { id: boutId } });
            if (!bout) return { type: 'read', message: `Bout ${boutId} not found.` };
            const boutBytes32 = uuidToBytes32(boutId);
            return {
                type: 'write',
                intent: 'enter_bout',
                params: { boutId, title: bout.title },
                txSteps: [
                    {
                        label: `Approve ${bout.entryFee} $FORGE entry fee`,
                        contract: 'FORGE_TOKEN',
                        method: 'approve',
                        args: [config.chain.forgeArenaAddress, ethers.parseEther(bout.entryFee.toString()).toString()],
                    },
                    {
                        label: `Enter "${bout.title}"`,
                        contract: 'FORGE_ARENA',
                        method: 'enterBout',
                        args: [boutBytes32],
                    },
                ],
                message: `Ready to enter "${bout.title}" (${bout.entryFee} $FORGE entry fee). Confirm in your wallet.`,
            };
        }

        case 'place_bet': {
            let boutId = args.bout_id;
            const bout = await prisma.bout.findUnique({ where: { id: boutId } });
            if (!bout) return { type: 'read', message: `Bout ${boutId} not found.` };
            const boutBytes32 = uuidToBytes32(boutId);
            const amountWei = ethers.parseEther(args.amount.toString());
            return {
                type: 'write',
                intent: 'place_bet',
                params: { boutId, agent: args.agent, amount: args.amount },
                txSteps: [
                    {
                        label: `Approve ${args.amount} $FORGE`,
                        contract: 'FORGE_TOKEN',
                        method: 'approve',
                        args: [config.chain.forgeArenaAddress, amountWei.toString()],
                    },
                    {
                        label: `Bet ${args.amount} $FORGE on agent ${args.agent}`,
                        contract: 'FORGE_ARENA',
                        method: 'placeBet',
                        args: [boutBytes32, parseInt(args.agent) || 0, amountWei.toString()],
                    },
                ],
                message: `Ready to bet ${args.amount} $FORGE on agent ${args.agent} in bout "${bout.title}". Confirm in your wallet.`,
            };
        }

        default:
            return { type: 'error', message: `Unknown action: ${toolName}` };
    }
}

// ─── Route ──────────────────────────────────────────────────

router.post('/command', authenticate, async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
    }

    const walletAddress = req.wallet?.address;
    if (!walletAddress) {
        return res.status(401).json({ error: 'Wallet address required' });
    }

    try {
        // Step 1: Send to Bankr Router for intent parsing
        const llmResponse = await fetch(`${BANKR_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BANKR_KEY}`,
            },
            body: JSON.stringify({
                model: BANKR_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: message },
                ],
                tools: FORGE_TOOLS,
                tool_choice: 'auto',
            }),
        });

        if (!llmResponse.ok) {
            const errText = await llmResponse.text();
            logger.error({ status: llmResponse.status, body: errText }, 'Bankr Router error');
            return res.status(502).json({ error: 'Bankr Router unavailable' });
        }

        const llmData = await llmResponse.json();
        const choice = llmData.choices?.[0];

        if (!choice) {
            return res.status(502).json({ error: 'Empty response from Bankr Router' });
        }

        // Step 2: Check if LLM made a tool call
        const toolCalls = choice.message?.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
            // LLM responded with text (clarification, greeting, etc.)
            return res.json({
                type: 'chat',
                message: choice.message?.content || 'I can help you stake, bet, enter bouts, and more. What would you like to do?',
            });
        }

        // Step 3: Execute the tool call
        const tool = toolCalls[0];
        const toolName = tool.function.name;
        const toolArgs = JSON.parse(tool.function.arguments || '{}');

        logger.info({ toolName, toolArgs, wallet: walletAddress }, 'Bankr command parsed');

        const result = await executeAction(toolName, toolArgs, walletAddress);

        return res.json({
            intent: toolName,
            params: toolArgs,
            ...result,
        });
    } catch (err) {
        logger.error({ err, message }, 'Bankr command error');
        return res.status(500).json({ error: 'Failed to process command' });
    }
});

export default router;
