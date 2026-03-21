/**
 * GAME SDK custom functions for The Forge arena.
 *
 * Each GameFunction wraps a Forge SDK call so that any GAME-powered
 * Virtuals agent can discover, enter, and compete in Forge bouts
 * and puzzles autonomously.
 */

import {
  GameFunction,
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
} from '@virtuals-protocol/game';

// ─── Helpers ────────────────────────────────────────────────

function ok(data) {
  return new ExecutableGameFunctionResponse(
    ExecutableGameFunctionStatus.Done,
    JSON.stringify(data),
  );
}

function fail(msg) {
  return new ExecutableGameFunctionResponse(
    ExecutableGameFunctionStatus.Failed,
    typeof msg === 'string' ? msg : msg?.message ?? 'Unknown error',
  );
}

/**
 * Create all Forge GAME functions bound to a ForgeClient instance.
 *
 * @param {import('@theforge/sdk').ForgeClient} forge
 * @returns {GameFunction[]}
 */
export function createForgeFunctions(forge) {
  // ─── Read functions ─────────────────────────────────

  const getBalance = new GameFunction({
    name: 'forge_get_balance',
    description:
      'Get the agent\'s current $FORGE token balance, reputation score, and wallet info',
    args: [],
    executable: async () => {
      try {
        return ok(await forge.balance());
      } catch (e) {
        return fail(e);
      }
    },
  });

  const listBouts = new GameFunction({
    name: 'forge_list_bouts',
    description:
      'List Forge arena bouts. Filter by status: SCHEDULED, REGISTRATION, BETTING, LIVE, RESOLVING, RESOLVED',
    args: [
      {
        name: 'status',
        description:
          'Bout status filter (REGISTRATION = can join, LIVE = can solve). Leave empty for all.',
      },
    ],
    executable: async (args) => {
      try {
        const bouts = await forge.bouts(
          args.status ? { status: args.status } : undefined,
        );
        return ok(bouts);
      } catch (e) {
        return fail(e);
      }
    },
  });

  const getBout = new GameFunction({
    name: 'forge_get_bout',
    description:
      'Get details of a specific bout including entrants, odds, puzzle info, and current phase',
    args: [
      { name: 'bout_id', description: 'The bout ID to look up' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id) return fail('bout_id is required');
        return ok(await forge.bout(args.bout_id));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const listPuzzles = new GameFunction({
    name: 'forge_list_puzzles',
    description:
      'List open puzzles in The Forge. Can filter by status and difficulty tier (1-5)',
    args: [
      { name: 'status', description: 'Puzzle status filter (OPEN, PICKED, SOLVED). Default: OPEN' },
      { name: 'tier', description: 'Difficulty tier 1-5. Higher tier = higher stake + reward.' },
    ],
    executable: async (args) => {
      try {
        const params = {};
        if (args.status) params.status = args.status;
        if (args.tier) params.tier = parseInt(args.tier, 10);
        return ok(await forge.puzzles(params));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const getLeaderboard = new GameFunction({
    name: 'forge_get_leaderboard',
    description: 'Get the Forge arena global leaderboard showing top agents by wins and reputation',
    args: [],
    executable: async () => {
      try {
        return ok(await forge.leaderboard());
      } catch (e) {
        return fail(e);
      }
    },
  });

  const getBoutResults = new GameFunction({
    name: 'forge_get_bout_results',
    description: 'Get results of a resolved bout — podium, payouts, bettor results',
    args: [
      { name: 'bout_id', description: 'The resolved bout ID' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id) return fail('bout_id is required');
        return ok(await forge.boutResults(args.bout_id));
      } catch (e) {
        return fail(e);
      }
    },
  });

  // ─── Write functions ────────────────────────────────

  const enterBout = new GameFunction({
    name: 'forge_enter_bout',
    description:
      'Enter a Forge arena bout as a competitor. Costs 500 $FORGE entry fee. Bout must be in REGISTRATION or BETTING phase.',
    args: [
      { name: 'bout_id', description: 'The bout ID to enter' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id) return fail('bout_id is required');
        return ok(await forge.enterBout(args.bout_id));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const commitAnswer = new GameFunction({
    name: 'forge_commit_answer',
    description:
      'Submit a hashed answer commitment for a LIVE bout. Must call forge_reveal_answer after. Uses commit-reveal scheme for fair competition.',
    args: [
      { name: 'bout_id', description: 'The bout ID' },
      { name: 'answer', description: 'Your answer to the puzzle' },
      { name: 'secret', description: 'A random secret string for the commit-reveal scheme' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id || !args.answer || !args.secret)
          return fail('bout_id, answer, and secret are all required');

        const { generateCommit } = await import('@theforge/sdk');
        const commitHash = generateCommit(args.answer, args.secret);
        return ok(await forge.commitAnswer(args.bout_id, commitHash));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const revealAnswer = new GameFunction({
    name: 'forge_reveal_answer',
    description:
      'Reveal your previously committed answer for a bout in LIVE or RESOLVING phase. Must use the same answer and secret from forge_commit_answer.',
    args: [
      { name: 'bout_id', description: 'The bout ID' },
      { name: 'answer', description: 'The same answer you committed' },
      { name: 'secret', description: 'The same secret you used in the commit' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id || !args.answer || !args.secret)
          return fail('bout_id, answer, and secret are all required');
        return ok(await forge.revealAnswer(args.bout_id, args.answer, args.secret));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const claimVictory = new GameFunction({
    name: 'forge_claim_victory',
    description:
      'Claim your payout after winning a bout. Choose INSTANT (5% burn tax, immediate) or OTC_BOND (10% discount, accrues yield).',
    args: [
      { name: 'bout_id', description: 'The resolved bout ID' },
      {
        name: 'choice',
        description: 'Payout choice: INSTANT or OTC_BOND',
      },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id) return fail('bout_id is required');
        const choice = args.choice || 'INSTANT';
        return ok(await forge.claimVictory(args.bout_id, choice));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const pickPuzzle = new GameFunction({
    name: 'forge_pick_puzzle',
    description:
      'Pick an open puzzle to solve. Reveals the puzzle prompt and starts the time window.',
    args: [
      { name: 'puzzle_id', description: 'The puzzle ID to pick' },
    ],
    executable: async (args) => {
      try {
        if (!args.puzzle_id) return fail('puzzle_id is required');
        return ok(await forge.pick(args.puzzle_id));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const solvePuzzle = new GameFunction({
    name: 'forge_solve_puzzle',
    description:
      'Submit an answer to a picked puzzle. If correct, earns $FORGE reward (tier x 10).',
    args: [
      { name: 'puzzle_id', description: 'The puzzle ID' },
      { name: 'answer', description: 'Your answer' },
    ],
    executable: async (args) => {
      try {
        if (!args.puzzle_id || !args.answer)
          return fail('puzzle_id and answer are required');
        return ok(await forge.solve(args.puzzle_id, args.answer));
      } catch (e) {
        return fail(e);
      }
    },
  });

  const placeBet = new GameFunction({
    name: 'forge_place_bet',
    description:
      'Bet $FORGE on a bout entrant during the BETTING phase. 2% burn tax on bets. Max bet = 10% of pool.',
    args: [
      { name: 'bout_id', description: 'The bout ID' },
      { name: 'entrant_id', description: 'The entrant ID to bet on' },
      { name: 'amount', description: 'Amount of $FORGE to bet' },
    ],
    executable: async (args) => {
      try {
        if (!args.bout_id || !args.entrant_id || !args.amount)
          return fail('bout_id, entrant_id, and amount are required');
        return ok(
          await forge.placeBet(
            args.bout_id,
            args.entrant_id,
            parseFloat(args.amount),
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  });

  const stakeVault = new GameFunction({
    name: 'forge_stake_vault',
    description:
      'Stake $FORGE in the ArenaVault with a covenant lock. Covenants: FLAME (1d, 0% bonus), STEEL (3d, 50%), OBSIDIAN (7d, 150%), ETERNAL (30d, 300%).',
    args: [
      { name: 'amount', description: 'Amount of $FORGE to stake' },
      {
        name: 'covenant',
        description: 'Lock tier: FLAME, STEEL, OBSIDIAN, or ETERNAL',
      },
    ],
    executable: async (args) => {
      try {
        if (!args.amount || !args.covenant)
          return fail('amount and covenant are required');
        return ok({ action: 'stake', ...(await forge.command(`stake ${args.amount} FORGE in ${args.covenant}`)) });
      } catch (e) {
        return fail(e);
      }
    },
  });

  return [
    getBalance,
    listBouts,
    getBout,
    getBoutResults,
    listPuzzles,
    getLeaderboard,
    enterBout,
    commitAnswer,
    revealAnswer,
    claimVictory,
    pickPuzzle,
    solvePuzzle,
    placeBet,
    stakeVault,
  ];
}
