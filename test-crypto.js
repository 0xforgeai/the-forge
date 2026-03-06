/**
 * End-to-end test for computational puzzles.
 * Registers an agent, picks a FACTORING and HASH_PREFIX puzzle, solves them.
 */
import crypto from 'crypto';

const API = 'http://localhost:3000/api';

async function req(method, path, body, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;
    const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

function solveHashPrefix(prefix) {
    console.log(`  Brute-forcing hash prefix "${prefix}"...`);
    let i = 0;
    while (true) {
        const candidate = `forge-${i}`;
        const hash = crypto.createHash('sha256').update(candidate).digest('hex');
        if (hash.startsWith(prefix)) {
            console.log(`  Found after ${i + 1} attempts: "${candidate}" → ${hash.slice(0, 16)}...`);
            return candidate;
        }
        i++;
        if (i % 100000 === 0) process.stdout.write(`  ${i} attempts...\r`);
    }
}

function factorSemiprime(n) {
    console.log(`  Factoring ${n}...`);
    for (let i = 2; i * i <= n; i++) {
        if (n % i === 0) {
            const p = i, q = n / i;
            console.log(`  Found: ${p} × ${q}`);
            return `${Math.min(p, q)},${Math.max(p, q)}`;
        }
    }
    throw new Error('Could not factor');
}

async function test() {
    console.log('=== COMPUTATIONAL PUZZLE E2E TEST ===\n');

    // Register
    const ts = Date.now();
    const agent = await req('POST', '/register', { name: `compute-test-${ts}` });
    console.log(`Registered: ${agent.name} (${agent.balance} $FORGE)\n`);

    // Get all open puzzles
    const { puzzles } = await req('GET', '/puzzles?status=OPEN');
    console.log(`Open puzzles: ${puzzles.length}\n`);

    // ── Test 1: Solve a FACTORING puzzle ──
    const factPuzzle = puzzles.find(p => p.puzzleType === 'FACTORING');
    if (factPuzzle) {
        console.log(`--- FACTORING TEST ---`);
        console.log(`Title: ${factPuzzle.title} (T${factPuzzle.tier}, ${factPuzzle.stake} staked)`);

        const picked = await req('POST', `/puzzles/${factPuzzle.id}/pick`, null, agent.apiKey);
        console.log(`Prompt: ${picked.prompt}`);
        console.log(`Challenge: semiprime=${picked.challengeData.semiprime}`);

        const answer = factorSemiprime(picked.challengeData.semiprime);
        const result = await req('POST', `/puzzles/${factPuzzle.id}/solve`, { answer }, agent.apiKey);

        if (result.correct) {
            console.log(`✓ SOLVED! Payout: ${result.payout} $FORGE\n`);
        } else {
            console.log(`✗ FAILED: ${result.message}\n`);
            process.exit(1);
        }
    }

    // ── Test 2: Solve a HASH_PREFIX puzzle (T1 = 4 hex chars) ──
    const hashPuzzle = puzzles.find(p => p.puzzleType === 'HASH_PREFIX' && p.tier === 1);
    if (hashPuzzle) {
        console.log(`--- HASH PREFIX TEST ---`);
        console.log(`Title: ${hashPuzzle.title} (T${hashPuzzle.tier}, ${hashPuzzle.stake} staked)`);

        const picked = await req('POST', `/puzzles/${hashPuzzle.id}/pick`, null, agent.apiKey);
        console.log(`Prompt: ${picked.prompt}`);
        console.log(`Challenge: prefix="${picked.challengeData.prefix}"`);

        const answer = solveHashPrefix(picked.challengeData.prefix);
        const result = await req('POST', `/puzzles/${hashPuzzle.id}/solve`, { answer }, agent.apiKey);

        if (result.correct) {
            console.log(`✓ SOLVED! Payout: ${result.payout} $FORGE\n`);
        } else {
            console.log(`✗ FAILED: ${result.message}\n`);
            process.exit(1);
        }
    }

    // Final balance
    const bal = await req('GET', '/balance', null, agent.apiKey);
    console.log(`Final balance: ${bal.balance} $FORGE, gas: ${bal.gas}`);

    console.log('\n=== ALL COMPUTATIONAL TESTS PASSED ===');
}

test().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
