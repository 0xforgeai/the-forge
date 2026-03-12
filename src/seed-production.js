/**
 * Seed production data for The Forge launch.
 *
 * Registers agents, adjusts balances, creates practice puzzles,
 * and seeds upcoming bouts — all via the live production API.
 *
 * Usage:
 *   node src/seed-production.js
 *
 * Env:
 *   API_BASE  - defaults to https://the-forge-production-45c4.up.railway.app
 *   ADMIN_USER / ADMIN_PASS - for wallet adjustments
 */

const API_BASE = process.env.API_BASE || 'https://the-forge-production-45c4.up.railway.app';
const ADMIN_USER = process.env.ADMIN_USER || 'forgeadmin_bfd8cd02';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Dis8Lm3uUBaxzNBOj15X40nnyqFEZ6Dw';
const ADMIN_AUTH = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Helpers ──────────────────────────────────────────────

async function api(method, path, body, headers = {}) {
    const url = `${API_BASE}${path}`;
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}: ${text.substring(0, 200)}`;
        // Don't throw on "already exists" type errors
        if (res.status === 409 || msg.includes('already taken')) {
            console.log(`  ⚠ ${msg}`);
            return { skipped: true, ...data };
        }
        throw new Error(`${method} ${path}: ${msg}`);
    }
    return data;
}

function adminApi(method, path, body) {
    return api(method, `/api/admin${path}`, body, { Authorization: ADMIN_AUTH });
}

function agentApi(method, path, body, apiKey) {
    return api(method, `/api${path}`, body, { 'x-api-key': apiKey });
}

// ─── Agent Definitions ────────────────────────────────────

const AGENTS = [
    { name: 'EMBER_7', xHandle: '@ember7_forge' },
    { name: 'IRONCLAD', xHandle: '@ironclad_forge' },
    { name: 'GHOST_PROTOCOL', xHandle: '@ghost_forge' },
    { name: 'NEUROVAULT', xHandle: '@neurovault_forge' },
    { name: 'CIPHER_X', xHandle: '@cipherx_forge' },
];

// ─── Practice Puzzle Definitions ──────────────────────────

const PUZZLES = [
    {
        title: 'Warm-Up: Hex Decode',
        prompt: 'Decode this hex string: 4865 6c6c 6f20 466f 7267 65',
        answer: 'Hello Forge',
        answerType: 'TEXT',
        difficultyTier: 1,
        stake: 100,
        timeWindowSeconds: 14400,
        maxAttempts: 5,
    },
    {
        title: 'Pattern Match: Fibonacci',
        prompt: 'What is the 12th Fibonacci number? (F(1)=1, F(2)=1)',
        answer: '144',
        answerType: 'NUMBER',
        difficultyTier: 1,
        stake: 100,
        timeWindowSeconds: 14400,
        maxAttempts: 3,
    },
    {
        title: 'Cipher Challenge: ROT13',
        prompt: 'Decrypt this ROT13 message: GUR SBETR ARIRE FYRRCF',
        answer: 'THE FORGE NEVER SLEEPS',
        answerType: 'TEXT',
        difficultyTier: 2,
        stake: 200,
        timeWindowSeconds: 43200,
        maxAttempts: 3,
    },
    {
        title: 'Modular Arithmetic',
        prompt: 'Compute: 7^123 mod 101. Give the integer result.',
        answer: '58',
        answerType: 'NUMBER',
        difficultyTier: 3,
        stake: 300,
        timeWindowSeconds: 86400,
        maxAttempts: 3,
    },
    {
        title: 'Binary Logic Gate',
        prompt: 'Given inputs A=1, B=0, C=1: compute (A XOR B) AND (B OR C) AND (NOT (A AND B AND C)). Give 0 or 1.',
        answer: '1',
        answerType: 'NUMBER',
        difficultyTier: 3,
        stake: 300,
        timeWindowSeconds: 86400,
        maxAttempts: 3,
    },
];

// ─── Main ─────────────────────────────────────────────────

async function main() {
    console.log(`\n🔥 THE FORGE — Production Seed`);
    console.log(`   API: ${API_BASE}\n`);

    // 1. Health check
    try {
        const health = await api('GET', '/api/health');
        console.log(`✓ API healthy (uptime: ${Math.floor(health.uptime / 3600)}h)\n`);
    } catch (err) {
        console.error(`✗ API unreachable: ${err.message}`);
        process.exit(1);
    }

    // 2. Register agents (with delays to avoid rate limiter)
    console.log('── Registering Agents ──────────────────');
    const agentKeys = {};
    for (const agent of AGENTS) {
        try {
            const result = await api('POST', '/api/register', agent);
            if (result.skipped) {
                console.log(`  ${agent.name}: already registered`);
            } else {
                agentKeys[agent.name] = result.apiKey;
                console.log(`  ✓ ${agent.name} registered (balance: ${result.balance}, burn: ${result.registrationBurn})`);
                console.log(`    🔑 ${result.apiKey}`);
            }
        } catch (err) {
            console.error(`  ✗ ${agent.name}: ${err.message}`);
        }
        await sleep(2000); // avoid rate limit
    }

    // 3. Get all wallets via admin API
    console.log('\n── Fetching Wallets via Admin ──────────');
    let wallets;
    try {
        const result = await adminApi('GET', '/wallets?limit=100');
        wallets = result.wallets;
        console.log(`  Found ${wallets.length} wallets`);
    } catch (err) {
        console.error(`  ✗ Admin wallets: ${err.message}`);
        console.log('  Continuing without wallet adjustments...');
        wallets = [];
    }

    // 4. Adjust balances for our agents
    if (wallets.length > 0) {
        console.log('\n── Adjusting Agent Balances ────────────');
        const agentWallets = wallets.filter(w => AGENTS.some(a => a.name === w.name));

        for (const wallet of agentWallets) {
            const targetBalance = 10000;
            const adjustment = targetBalance - wallet.balance;
            if (adjustment > 0) {
                try {
                    const result = await adminApi('POST', `/wallets/${wallet.id}/adjust`, {
                        amount: adjustment,
                        memo: 'Launch seed: initial balance for AI agent',
                    });
                    console.log(`  ✓ ${wallet.name}: +${adjustment} → ${result.newBalance} $FORGE`);
                } catch (err) {
                    console.error(`  ✗ ${wallet.name}: ${err.message}`);
                }
                await sleep(500);
            } else {
                console.log(`  ${wallet.name}: already at ${wallet.balance} $FORGE`);
            }
        }
    }

    // 5. Create practice puzzles (use the first agent with a key)
    console.log('\n── Creating Practice Puzzles ───────────');
    const smithName = Object.keys(agentKeys)[0];
    const smithKey = smithName ? agentKeys[smithName] : null;

    if (!smithKey) {
        console.log('  ⚠ No API keys available — agents were previously registered.');
        console.log('    To create puzzles, re-run with fresh agents or use stored keys.');
    } else {
        console.log(`  Smith: ${smithName}`);
        for (const puzzle of PUZZLES) {
            try {
                const result = await agentApi('POST', '/puzzles', puzzle, smithKey);
                if (result.skipped) {
                    console.log(`  ${puzzle.title}: skipped`);
                } else {
                    console.log(`  ✓ ${puzzle.title} (T${result.tier}, ${result.stake} staked)`);
                }
            } catch (err) {
                console.error(`  ✗ ${puzzle.title}: ${err.message}`);
            }
            await sleep(1000);
        }
    }

    // 6. Summary
    console.log('\n── Final Stats ────────────────────────');
    try {
        const stats = await api('GET', '/api/stats');
        console.log(`  Total agents: ${stats.totalAgents}`);
        console.log(`  Active puzzles: ${stats.activePuzzles}`);
        console.log(`  Total $FORGE supply: ${stats.totalSupply}`);
    } catch (err) {
        console.log(`  ⚠ Could not fetch public stats: ${err.message}`);
    }

    try {
        const adminStats = await adminApi('GET', '/stats');
        console.log(`  Wallets: ${adminStats.wallets}`);
        console.log(`  Puzzles by status: ${JSON.stringify(adminStats.puzzlesByStatus)}`);
        console.log(`  Total transactions: ${adminStats.totalTransactions}`);
    } catch (err) {
        console.log(`  ⚠ Could not fetch admin stats: ${err.message}`);
    }

    console.log('\n── Bout Seeding ───────────────────────');
    console.log('  Bouts require Prisma — run via Railway:');
    console.log('    railway run node src/seed-bouts.js');

    console.log('\n🔥 Seed complete!\n');
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
