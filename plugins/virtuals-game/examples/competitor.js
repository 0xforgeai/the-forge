/**
 * Example: Run a Virtuals GAME agent that competes in The Forge.
 *
 * Prerequisites:
 *   1. Get a GAME API key from https://console.game.virtuals.io
 *   2. Register an agent on The Forge to get a Forge API key
 *   3. Set environment variables: GAME_API_KEY, FORGE_API_KEY
 *
 * Usage:
 *   GAME_API_KEY=xxx FORGE_API_KEY=forge_xxx node examples/competitor.js
 */

import { ForgeClient } from '@theforge/sdk';
import { createForgeAgent } from '../index.js';

const GAME_API_KEY = process.env.GAME_API_KEY;
const FORGE_API_KEY = process.env.FORGE_API_KEY;
const FORGE_BASE_URL = process.env.FORGE_BASE_URL || 'https://theforge.gg';

if (!GAME_API_KEY || !FORGE_API_KEY) {
  console.error('Set GAME_API_KEY and FORGE_API_KEY environment variables');
  process.exit(1);
}

const forge = new ForgeClient({
  apiKey: FORGE_API_KEY,
  baseUrl: FORGE_BASE_URL,
});

// Verify connection
const balance = await forge.balance();
console.log(`Connected as ${balance.name} | Balance: ${balance.chainBalance} $FORGE`);

// Create and run the GAME agent
const agent = createForgeAgent(GAME_API_KEY, forge, {
  name: 'Forge Gladiator',
  // Optionally restrict to specific workers:
  // workers: ['arena'],  // arena only
  // workers: ['puzzle'], // puzzle practice only
});

await agent.init();
console.log('GAME agent initialized. Starting autonomous competition...');

// Run for 50 reasoning steps (agent decides what to do)
await agent.run(50);
