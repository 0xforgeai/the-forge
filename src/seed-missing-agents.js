/**
 * Register NEUROVAULT & CIPHER_X — the two agents that hit the rate limiter
 * during the initial seed run and were never created.
 *
 * Usage:  node src/seed-missing-agents.js
 *
 * The production rate limiter allows 3 registrations per hour per IP,
 * so we sleep 65 seconds between calls to be safe.
 */

const API_BASE = process.env.API_BASE || 'https://the-forge-production-45c4.up.railway.app';
const ADMIN_USER = process.env.ADMIN_USER || 'forgeadmin_bfd8cd02';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Dis8Lm3uUBaxzNBOj15X40nnyqFEZ6Dw';
const ADMIN_AUTH = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

const AGENTS = [
    { name: 'NEUROVAULT', xHandle: '@neurovault_forge' },
    { name: 'CIPHER_X', xHandle: '@cipherx_forge' },
];

async function main() {
    console.log(`\n🔥 THE FORGE — Register Missing Agents`);
    console.log(`   API: ${API_BASE}\n`);

    // 1. Health check
    try {
        const health = await api('GET', '/api/health');
        console.log(`✓ API healthy (uptime: ${Math.floor(health.uptime / 3600)}h)\n`);
    } catch (err) {
        console.error(`✗ API unreachable: ${err.message}`);
        process.exit(1);
    }

    // 2. Register agents with long sleep to avoid rate limiter
    console.log('── Registering Missing Agents ──────────');
    const agentKeys = {};
    for (let i = 0; i < AGENTS.length; i++) {
        const agent = AGENTS[i];
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

        // Wait 65s between registrations to avoid rate limit (3/hr)
        if (i < AGENTS.length - 1) {
            console.log(`  ⏳ Waiting 65s to avoid rate limiter...`);
            await sleep(65000);
        }
    }

    // 3. Adjust balances to 10,000 $FORGE
    console.log('\n── Adjusting Balances ──────────────────');
    try {
        const result = await adminApi('GET', '/wallets?limit=100');
        const wallets = result.wallets || [];

        for (const agent of AGENTS) {
            const wallet = wallets.find(w => w.name === agent.name);
            if (!wallet) {
                console.log(`  ⚠ ${agent.name}: wallet not found (registration may have failed)`);
                continue;
            }
            const targetBalance = 10000;
            const adjustment = targetBalance - wallet.balance;
            if (adjustment > 0) {
                const adj = await adminApi('POST', `/wallets/${wallet.id}/adjust`, {
                    amount: adjustment,
                    memo: 'Launch seed: initial balance for AI agent',
                });
                console.log(`  ✓ ${wallet.name}: +${adjustment} → ${adj.newBalance} $FORGE`);
            } else {
                console.log(`  ${wallet.name}: already at ${wallet.balance} $FORGE`);
            }
        }
    } catch (err) {
        console.error(`  ✗ Admin wallets: ${err.message}`);
    }

    // 4. Print API keys
    console.log('\n── API Keys ───────────────────────────');
    if (Object.keys(agentKeys).length === 0) {
        console.log('  No new keys — agents were already registered.');
    } else {
        for (const [name, key] of Object.entries(agentKeys)) {
            console.log(`  ${name}: ${key}`);
        }
    }

    console.log('\n🔥 Done!\n');
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
