/**
 * Mass Agent Creator — The Forge
 *
 * Batch-creates solver agents for bout participation:
 *   1. Generates N random Ethereum wallets
 *   2. Registers each agent via the production API
 *   3. Funds each agent with $FORGE from the deployer wallet
 *   4. Approves ForgeArena to spend agent tokens
 *   5. Outputs agents-manifest.json with all credentials
 *
 * Usage:
 *   node src/mass-create-agents.js
 *
 * Env:
 *   AGENT_COUNT       — number of agents to create (default: 8)
 *   AGENT_PREFIX      — name prefix (default: SOLVER)
 *   FORGE_PER_AGENT   — $FORGE to fund each agent (default: 1000)
 *   API_BASE          — target API URL
 *   REG_DELAY_MS      — delay between registrations (default: 2000)
 *   DRY_RUN           — set to "true" to preview without executing
 *   PRIVATE_KEY       — deployer private key (from .env)
 *   BASE_RPC_URL      — Base mainnet RPC URL (from .env)
 */

import { ethers } from 'ethers';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────

const AGENT_COUNT     = parseInt(process.env.AGENT_COUNT || '8', 10);
const AGENT_PREFIX    = process.env.AGENT_PREFIX || 'SOLVER';
const FORGE_PER_AGENT = parseInt(process.env.FORGE_PER_AGENT || '1000', 10);
const API_BASE        = process.env.API_BASE || 'https://the-forge-production-45c4.up.railway.app';
const REG_DELAY_MS    = parseInt(process.env.REG_DELAY_MS || '2000', 10);
const DRY_RUN         = process.env.DRY_RUN === 'true';

const PRIVATE_KEY     = process.env.PRIVATE_KEY || '';
const BASE_RPC_URL    = process.env.BASE_RPC_URL || '';

// Contract addresses (match config.js defaults)
const FORGE_TOKEN_ADDRESS = process.env.FORGE_TOKEN_ADDRESS || '0xf6c2965295ce2178f64832163a9a97ccf61a3aee';
const FORGE_ARENA_ADDRESS = process.env.FORGE_ARENA_ADDRESS || '0x22FFDf9E88cEFE2781b9Ebe17eabd4388Ab6cff4';

const FORGE_TOKEN_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── API Helper ────────────────────────────────────────────────

async function api(method, path, body) {
    const url = `${API_BASE}${path}`;
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}: ${text.substring(0, 200)}`;
        if (res.status === 409 || msg.includes('already taken')) {
            return { skipped: true, ...data };
        }
        throw new Error(`${method} ${path}: ${msg}`);
    }
    return data;
}

// ─── Agent Wallet Generation ──────────────────────────────────

function generateAgents(count, prefix) {
    const agents = [];
    for (let i = 1; i <= count; i++) {
        const idx = String(i).padStart(2, '0');
        const wallet = ethers.Wallet.createRandom();
        agents.push({
            name: `${prefix}_${idx}`,
            xHandle: `@${prefix.toLowerCase()}${idx}_forge`,
            privateKey: wallet.privateKey,
            address: wallet.address,
            apiKey: null,       // filled after registration
            funded: false,
            approved: false,
        });
    }
    return agents;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
    console.log(`
╔══════════════════════════════════════════════════╗
║  🔥 THE FORGE — Mass Agent Creator              ║
╠══════════════════════════════════════════════════╣
║  Agents:    ${String(AGENT_COUNT).padEnd(36)}║
║  Prefix:    ${AGENT_PREFIX.padEnd(36)}║
║  Funding:   ${(FORGE_PER_AGENT + ' $FORGE each').padEnd(36)}║
║  API:       ${API_BASE.substring(0, 36).padEnd(36)}║
║  Mode:      ${(DRY_RUN ? '🧪 DRY RUN' : '🔴 LIVE').padEnd(36)}║
╚══════════════════════════════════════════════════╝
`);

    // ── Step 1: Generate wallets ────────────────────
    console.log('── Step 1: Generating Agent Wallets ───────');
    const agents = generateAgents(AGENT_COUNT, AGENT_PREFIX);

    for (const a of agents) {
        console.log(`  ${a.name}  ${a.address}`);
    }
    console.log(`  ✓ ${agents.length} wallets generated\n`);

    if (DRY_RUN) {
        console.log('── DRY RUN — Skipping API calls and on-chain ops ──');
        printSummary(agents);
        saveManifest(agents);
        return;
    }

    // ── Step 2: Check chain connectivity ────────────
    if (!PRIVATE_KEY || !BASE_RPC_URL) {
        console.error('✗ PRIVATE_KEY and BASE_RPC_URL are required for live mode.');
        console.error('  Set them in .env or run with DRY_RUN=true');
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const deployerWallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const forgeToken = new ethers.Contract(FORGE_TOKEN_ADDRESS, FORGE_TOKEN_ABI, deployerWallet);

    console.log('── Step 2: Chain Connectivity ─────────────');
    const deployerBalance = await forgeToken.balanceOf(deployerWallet.address);
    const totalNeeded = ethers.parseEther(String(FORGE_PER_AGENT * AGENT_COUNT));
    console.log(`  Deployer:  ${deployerWallet.address}`);
    console.log(`  Balance:   ${ethers.formatEther(deployerBalance)} $FORGE`);
    console.log(`  Needed:    ${ethers.formatEther(totalNeeded)} $FORGE (${FORGE_PER_AGENT} × ${AGENT_COUNT})`);

    if (deployerBalance < totalNeeded) {
        console.error(`  ✗ Insufficient deployer balance! Need ${ethers.formatEther(totalNeeded)}, have ${ethers.formatEther(deployerBalance)}`);
        process.exit(1);
    }
    console.log(`  ✓ Sufficient balance\n`);

    // ── Step 3: Health check ────────────────────────
    console.log('── Step 3: API Health Check ───────────────');
    try {
        const health = await api('GET', '/api/health');
        console.log(`  ✓ API healthy (uptime: ${Math.floor(health.uptime / 3600)}h)\n`);
    } catch (err) {
        console.error(`  ✗ API unreachable: ${err.message}`);
        process.exit(1);
    }

    // ── Step 4: Register agents via API ─────────────
    console.log('── Step 4: Registering Agents ─────────────');
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        try {
            const result = await api('POST', '/api/register', {
                name: agent.name,
                address: agent.address,
                xHandle: agent.xHandle,
            });

            if (result.skipped) {
                console.log(`  ⚠ ${agent.name}: already registered`);
            } else {
                agent.apiKey = result.apiKey;
                console.log(`  ✓ ${agent.name} registered`);
                console.log(`    🔑 ${result.apiKey}`);
            }
        } catch (err) {
            console.error(`  ✗ ${agent.name}: ${err.message}`);
        }

        // Delay between registrations to avoid rate limiter
        if (i < agents.length - 1) {
            console.log(`  ⏳ Waiting ${REG_DELAY_MS}ms...`);
            await sleep(REG_DELAY_MS);
        }
    }
    console.log();

    // ── Step 5: Fund agents on-chain ────────────────
    console.log('── Step 5: Funding Agents On-Chain ────────');
    const amountWei = ethers.parseEther(String(FORGE_PER_AGENT));

    for (const agent of agents) {
        try {
            console.log(`  ${agent.name}: Transferring ${FORGE_PER_AGENT} $FORGE...`);
            const tx = await forgeToken.transfer(agent.address, amountWei);
            const receipt = await tx.wait(1);
            agent.funded = true;
            console.log(`  ✓ ${agent.name}: funded (tx: ${receipt.hash})`);
        } catch (err) {
            console.error(`  ✗ ${agent.name}: transfer failed — ${err.message}`);
        }
        await sleep(500); // small gap between txns
    }
    console.log();

    // ── Step 6: Approve ForgeArena for each agent ───
    console.log('── Step 6: Approving ForgeArena ────────────');
    const MAX_UINT256 = ethers.MaxUint256;

    for (const agent of agents) {
        try {
            const agentWallet = new ethers.Wallet(agent.privateKey, provider);
            const agentToken = new ethers.Contract(FORGE_TOKEN_ADDRESS, FORGE_TOKEN_ABI, agentWallet);

            console.log(`  ${agent.name}: Approving ForgeArena...`);
            const tx = await agentToken.approve(FORGE_ARENA_ADDRESS, MAX_UINT256);
            const receipt = await tx.wait(1);
            agent.approved = true;
            console.log(`  ✓ ${agent.name}: approved (tx: ${receipt.hash})`);
        } catch (err) {
            console.error(`  ✗ ${agent.name}: approval failed — ${err.message}`);
        }
        await sleep(500);
    }
    console.log();

    // ── Step 7: Verify balances ─────────────────────
    console.log('── Step 7: Verifying Balances ─────────────');
    for (const agent of agents) {
        try {
            const balance = await forgeToken.balanceOf(agent.address);
            const allowance = await forgeToken.allowance(agent.address, FORGE_ARENA_ADDRESS);
            console.log(`  ${agent.name}: ${ethers.formatEther(balance)} $FORGE | Allowance: ${allowance > 0n ? '✓ approved' : '✗ not approved'}`);
        } catch (err) {
            console.error(`  ${agent.name}: balance check failed — ${err.message}`);
        }
    }
    console.log();

    // ── Output ──────────────────────────────────────
    printSummary(agents);
    saveManifest(agents);
}

// ─── Helpers ──────────────────────────────────────────────────

function printSummary(agents) {
    console.log('══════════════════════════════════════════════════');
    console.log('  AGENT SUMMARY');
    console.log('══════════════════════════════════════════════════');
    console.log(`  ${'Name'.padEnd(14)} ${'Address'.padEnd(44)} ${'API Key'.padEnd(20)} ${'Funded'} ${'Approved'}`);
    console.log('  ' + '─'.repeat(100));

    for (const a of agents) {
        const key = a.apiKey ? a.apiKey.substring(0, 16) + '...' : '(none)';
        console.log(`  ${a.name.padEnd(14)} ${a.address.padEnd(44)} ${key.padEnd(20)} ${a.funded ? '✓' : '✗'}      ${a.approved ? '✓' : '✗'}`);
    }

    const registered = agents.filter(a => a.apiKey).length;
    const funded = agents.filter(a => a.funded).length;
    const approved = agents.filter(a => a.approved).length;

    console.log();
    console.log(`  Registered: ${registered}/${agents.length}`);
    console.log(`  Funded:     ${funded}/${agents.length}`);
    console.log(`  Approved:   ${approved}/${agents.length}`);
    console.log('══════════════════════════════════════════════════\n');
}

function saveManifest(agents) {
    const manifest = {
        createdAt: new Date().toISOString(),
        agentCount: agents.length,
        forgePerAgent: FORGE_PER_AGENT,
        forgeArenaAddress: FORGE_ARENA_ADDRESS,
        forgeTokenAddress: FORGE_TOKEN_ADDRESS,
        apiBase: API_BASE,
        agents: agents.map(a => ({
            name: a.name,
            address: a.address,
            privateKey: a.privateKey,
            xHandle: a.xHandle,
            apiKey: a.apiKey,
            funded: a.funded,
            approved: a.approved,
        })),
    };

    const outPath = resolve(__dirname, '..', 'output', 'agents-manifest.json');
    try {
        writeFileSync(outPath, JSON.stringify(manifest, null, 2));
        console.log(`📄 Manifest saved to: ${outPath}`);
    } catch {
        // output dir might not exist, try current dir
        const fallback = resolve(__dirname, '..', 'agents-manifest.json');
        writeFileSync(fallback, JSON.stringify(manifest, null, 2));
        console.log(`📄 Manifest saved to: ${fallback}`);
    }

    console.log();
    console.log('⚠ IMPORTANT: The manifest contains private keys!');
    console.log('  Keep agents-manifest.json secure and do NOT commit it to git.\n');
    console.log('🔥 Done! Agents are ready for bout entry.\n');
}

// ─── Run ──────────────────────────────────────────────────────

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
