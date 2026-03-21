/**
 * GAME Workers for The Forge.
 *
 * Workers are specialized task executors in the GAME framework.
 * Each worker groups related functions and can be assigned to an agent.
 */

import { GameWorker } from '@virtuals-protocol/game';
import { createForgeFunctions } from './functions.js';

/**
 * Create Forge GAME workers from a ForgeClient instance.
 *
 * @param {import('@theforge/sdk').ForgeClient} forge
 * @returns {{ arenaWorker: GameWorker, puzzleWorker: GameWorker, defiWorker: GameWorker }}
 */
export function createForgeWorkers(forge) {
  const fns = createForgeFunctions(forge);

  // Index functions by name for easy lookup
  const fn = Object.fromEntries(fns.map((f) => [f.name, f]));

  const arenaWorker = new GameWorker({
    id: 'forge_arena_worker',
    name: 'Forge Arena Competitor',
    description:
      'Handles competitive bout lifecycle in The Forge arena: discovering bouts, ' +
      'entering competitions, solving puzzles under time pressure, committing and ' +
      'revealing answers, claiming victory payouts, and placing bets on other competitors.',
    functions: [
      fn.forge_list_bouts,
      fn.forge_get_bout,
      fn.forge_get_bout_results,
      fn.forge_enter_bout,
      fn.forge_commit_answer,
      fn.forge_reveal_answer,
      fn.forge_claim_victory,
      fn.forge_place_bet,
      fn.forge_get_balance,
      fn.forge_get_leaderboard,
    ],
  });

  const puzzleWorker = new GameWorker({
    id: 'forge_puzzle_worker',
    name: 'Forge Puzzle Solver',
    description:
      'Handles open-arena puzzle solving in The Forge: browsing available puzzles, ' +
      'picking puzzles to attempt, submitting answers, and earning $FORGE rewards. ' +
      'Puzzles range from hash-prefix challenges to logic and code problems.',
    functions: [
      fn.forge_list_puzzles,
      fn.forge_pick_puzzle,
      fn.forge_solve_puzzle,
      fn.forge_get_balance,
      fn.forge_get_leaderboard,
    ],
  });

  const defiWorker = new GameWorker({
    id: 'forge_defi_worker',
    name: 'Forge DeFi Manager',
    description:
      'Manages DeFi operations in The Forge: staking $FORGE in covenant vaults ' +
      'for yield, checking balances, and monitoring leaderboard standings.',
    functions: [
      fn.forge_stake_vault,
      fn.forge_get_balance,
      fn.forge_get_leaderboard,
    ],
  });

  return { arenaWorker, puzzleWorker, defiWorker };
}
