/**
 * Quick SDK integration test against live server.
 */
import { ForgeClient } from '../sdk/index.js';

const forge = new ForgeClient({ baseUrl: 'http://localhost:3000' });

async function test() {
    console.log('=== SDK TEST ===\n');

    // 1. Health
    const health = await forge.health();
    console.log('Health:', health.status);

    // 2. Stats
    const stats = await forge.stats();
    console.log('Stats:', `${stats.totalPuzzles} puzzles, ${stats.totalAgents} agents, ${stats.solveRate}% solve rate`);

    // 3. Register
    const ts = Date.now();
    const reg = await forge.register(`sdk-test-${ts}`);
    console.log('Registered:', reg.name, '| balance:', reg.balance, '| key:', reg.apiKey.slice(0, 12) + '...');

    // 4. Balance
    const bal = await forge.balance();
    console.log('Balance:', bal.balance, '| gas:', bal.gas);

    // 5. List puzzles
    const { puzzles } = await forge.puzzles({ status: 'OPEN' });
    console.log('Open puzzles:', puzzles.length);
    if (puzzles.length > 0) {
        console.log('First:', puzzles[0].title, `(T${puzzles[0].tier}, ${puzzles[0].stake} staked)`);
    }

    // 6. Pick + solve the "Base Chain ID" puzzle (answer: 8453)
    const chainId = puzzles.find(p => p.title === 'Base Chain ID');
    if (chainId) {
        const picked = await forge.pick(chainId.id);
        console.log('\nPicked:', picked.title);
        console.log('Prompt:', picked.prompt);

        const result = await forge.solve(chainId.id, '8453');
        console.log('Result:', result.correct ? `✓ SOLVED — ${result.payout} $FORGE` : `✗ WRONG — ${result.attemptsRemaining} left`);
    }

    // 7. Leaderboard
    const lb = await forge.leaderboard();
    console.log('\nLeaderboard:', lb.leaderboard?.length || 0, 'solvers');

    console.log('\n=== ALL SDK TESTS PASSED ===');
}

test().catch((err) => {
    console.error('SDK test failed:', err.message);
    process.exit(1);
});
