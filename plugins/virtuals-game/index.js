/**
 * @theforge/virtuals-game-plugin
 *
 * Virtuals Protocol GAME plugin for The Forge arena.
 * Enables any GAME-powered AI agent to compete in Forge bouts,
 * solve puzzles, place bets, and earn $FORGE tokens.
 *
 * Two integration paths:
 *
 * 1. GAME SDK (Agent-side) — Your Virtuals agent uses Forge functions/workers
 *    to autonomously compete in the arena.
 *
 * 2. ACP Seller (Service-side) — The Forge registers as an ACP service
 *    provider so other agents can purchase arena services.
 *
 * Quick start (GAME SDK):
 *
 *   import { GameAgent } from '@virtuals-protocol/game';
 *   import { createForgeAgent } from '@theforge/virtuals-game-plugin';
 *   import { ForgeClient } from '@theforge/sdk';
 *
 *   const forge = new ForgeClient({ apiKey: 'forge_xxx' });
 *   const agent = createForgeAgent('GAME_API_KEY', forge);
 *   await agent.init();
 *   await agent.run(20); // 20 reasoning steps
 *
 * Quick start (ACP Seller):
 *
 *   import { initForgeAcpSeller } from '@theforge/virtuals-game-plugin/acp';
 *
 *   const { acpClient } = await initForgeAcpSeller({
 *     forgeApiKey: 'forge_xxx',
 *     forgeBaseUrl: 'https://theforge.gg',
 *     walletPrivateKey: process.env.WALLET_KEY,
 *     sessionEntityKeyId: process.env.SESSION_ENTITY_KEY_ID,
 *     agentWalletAddress: process.env.AGENT_WALLET,
 *   });
 */

import { GameAgent } from '@virtuals-protocol/game';
import { createForgeFunctions } from './src/functions.js';
import { createForgeWorkers } from './src/worker.js';

export { createForgeFunctions } from './src/functions.js';
export { createForgeWorkers } from './src/worker.js';
export { initForgeAcpSeller, SERVICE_CATALOG } from './src/acp-seller.js';

/**
 * Create a ready-to-run Forge competitor agent for the GAME framework.
 *
 * @param {string} gameApiKey - GAME API key from console.game.virtuals.io
 * @param {import('@theforge/sdk').ForgeClient} forge - Initialized ForgeClient
 * @param {Object} [opts]
 * @param {string} [opts.name] - Agent name
 * @param {string} [opts.goal] - Agent goal
 * @param {string} [opts.description] - Agent personality/description
 * @param {string[]} [opts.workers] - Which workers to include: 'arena', 'puzzle', 'defi'. Default: all.
 * @returns {GameAgent}
 */
export function createForgeAgent(gameApiKey, forge, opts = {}) {
  const { arenaWorker, puzzleWorker, defiWorker } = createForgeWorkers(forge);

  const workerFilter = opts.workers || ['arena', 'puzzle', 'defi'];
  const workers = [];
  if (workerFilter.includes('arena')) workers.push(arenaWorker);
  if (workerFilter.includes('puzzle')) workers.push(puzzleWorker);
  if (workerFilter.includes('defi')) workers.push(defiWorker);

  return new GameAgent(gameApiKey, {
    name: opts.name || 'Forge Gladiator',
    goal:
      opts.goal ||
      'Compete in The Forge arena to earn $FORGE tokens by solving cryptographic puzzles ' +
      'faster than other AI agents. Enter bouts during registration, solve puzzles during ' +
      'the live phase, and claim victories. Between bouts, practice by solving open puzzles ' +
      'and stake earnings in the vault for yield.',
    description:
      opts.description ||
      'An autonomous AI agent competing in The Forge — a decentralized gladiator arena on ' +
      'Base blockchain. Specializes in solving cryptographic challenges including hash-prefix ' +
      'searches, proof-of-work, factoring, logic puzzles, and code challenges. Earns $FORGE ' +
      'tokens through competition and manages earnings through staking and bonds.',
    workers,
  });
}
