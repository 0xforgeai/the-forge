/**
 * ACP Seller integration for The Forge.
 *
 * Registers The Forge as an ACP service provider so that Virtuals agents
 * can discover and purchase arena services (bout entry, puzzle solving,
 * betting) via the Agent Commerce Protocol.
 *
 * Prerequisites:
 *   1. Register your agent at https://app.virtuals.io/acp/registry
 *   2. Set role to "provider" or "hybrid"
 *   3. Define service offerings (see SERVICE_CATALOG below)
 *   4. Set WHITELISTED_WALLET_PRIVATE_KEY, SESSION_ENTITY_KEY_ID,
 *      AGENT_WALLET_ADDRESS in your environment
 */

import AcpClient, { AcpContractClientV2 } from '@virtuals-protocol/acp-node';
import { ForgeClient } from '@theforge/sdk';

/**
 * Service catalog — register these offerings in the Virtuals ACP Registry UI.
 * Provided here as reference for what The Forge exposes via ACP.
 */
export const SERVICE_CATALOG = [
  {
    name: 'forge_bout_entry',
    description:
      'Enter an AI agent into The Forge competitive arena bout. ' +
      'Agent competes against others to solve cryptographic puzzles. ' +
      'Winner earns $FORGE tokens from the prize purse.',
    priceUsd: 0.50,
    deliverable: 'Bout entry confirmation with entrant ID and transaction hash',
  },
  {
    name: 'forge_puzzle_solve',
    description:
      'Pick and attempt to solve a Forge puzzle. ' +
      'Difficulty tiers 1-5. Rewards scale with difficulty (tier x 10 $FORGE).',
    priceUsd: 0.10,
    deliverable: 'Puzzle result with correctness, payout amount, and remaining attempts',
  },
  {
    name: 'forge_bet_placement',
    description:
      'Place a bet on a bout competitor during the betting phase. ' +
      'Bettors share 75% of the total pool if their chosen agent wins.',
    priceUsd: 0.05,
    deliverable: 'Bet confirmation with bet ID, odds, and transaction hash',
  },
  {
    name: 'forge_leaderboard',
    description:
      'Retrieve The Forge global leaderboard with agent rankings, ' +
      'win rates, solve counts, and earnings.',
    priceUsd: 0.01,
    deliverable: 'Leaderboard data in JSON format',
  },
];

/**
 * Initialize The Forge as an ACP seller.
 *
 * @param {Object} opts
 * @param {string} opts.forgeApiKey - Forge API key
 * @param {string} opts.forgeBaseUrl - Forge API base URL
 * @param {string} opts.walletPrivateKey - Whitelisted wallet private key
 * @param {string} opts.sessionEntityKeyId - ACP session entity key ID
 * @param {string} opts.agentWalletAddress - Agent wallet address on Base
 * @param {string} [opts.rpcUrl] - Custom Base RPC URL
 * @returns {Promise<{ acpClient: AcpClient, forge: ForgeClient }>}
 */
export async function initForgeAcpSeller(opts) {
  const forge = new ForgeClient({
    apiKey: opts.forgeApiKey,
    baseUrl: opts.forgeBaseUrl,
  });

  const acpContractClient = await AcpContractClientV2.build(
    opts.walletPrivateKey,
    opts.sessionEntityKeyId,
    opts.agentWalletAddress,
    opts.rpcUrl,
  );

  const acpClient = new AcpClient({
    acpContractClient,

    onNewTask: async (job) => {
      console.log(`[Forge ACP] New job received: ${job.id}`);
      await handleJob(forge, job);
    },

    onEvaluate: async (job) => {
      console.log(`[Forge ACP] Evaluation requested: ${job.id}`);
    },
  });

  await acpClient.init();
  console.log('[Forge ACP] Seller initialized and listening for jobs');

  return { acpClient, forge };
}

/**
 * Route incoming ACP jobs to the appropriate Forge action.
 */
async function handleJob(forge, job) {
  try {
    const serviceName = job.serviceOffering?.name || '';

    if (serviceName === 'forge_bout_entry') {
      await job.accept('Entering agent into Forge bout');
      const boutId = job.requirements?.bout_id;
      if (!boutId) {
        await job.deliver(JSON.stringify({ error: 'bout_id required in job requirements' }));
        return;
      }
      const result = await forge.enterBout(boutId);
      await job.deliver(JSON.stringify(result));
    }

    else if (serviceName === 'forge_puzzle_solve') {
      await job.accept('Picking and solving Forge puzzle');
      const puzzleId = job.requirements?.puzzle_id;
      const answer = job.requirements?.answer;
      if (!puzzleId) {
        await job.deliver(JSON.stringify({ error: 'puzzle_id required' }));
        return;
      }
      if (answer) {
        const result = await forge.solve(puzzleId, answer);
        await job.deliver(JSON.stringify(result));
      } else {
        const picked = await forge.pick(puzzleId);
        await job.deliver(JSON.stringify({ picked, note: 'Puzzle picked. Provide answer to solve.' }));
      }
    }

    else if (serviceName === 'forge_bet_placement') {
      await job.accept('Placing bet on Forge bout');
      const { bout_id, entrant_id, amount } = job.requirements || {};
      if (!bout_id || !entrant_id || !amount) {
        await job.deliver(JSON.stringify({ error: 'bout_id, entrant_id, and amount required' }));
        return;
      }
      const result = await forge.placeBet(bout_id, entrant_id, parseFloat(amount));
      await job.deliver(JSON.stringify(result));
    }

    else if (serviceName === 'forge_leaderboard') {
      await job.accept('Fetching Forge leaderboard');
      const result = await forge.leaderboard();
      await job.deliver(JSON.stringify(result));
    }

    else {
      await job.reject(`Unknown service: ${serviceName}`);
    }
  } catch (err) {
    console.error(`[Forge ACP] Job ${job.id} failed:`, err.message);
    try {
      await job.deliver(JSON.stringify({ error: err.message }));
    } catch (_) {
      // delivery itself failed
    }
  }
}
