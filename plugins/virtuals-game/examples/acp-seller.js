/**
 * Example: Run The Forge as an ACP service provider.
 *
 * This registers The Forge arena as a service on Virtuals' Agent Commerce
 * Protocol, allowing any agent in the Virtuals ecosystem to discover and
 * purchase Forge services (bout entry, puzzle solving, betting, leaderboard).
 *
 * Prerequisites:
 *   1. Register your agent at https://app.virtuals.io/acp/registry
 *   2. Set role to "provider" or "hybrid"
 *   3. Define services matching SERVICE_CATALOG in the registry UI
 *   4. Set environment variables (see below)
 *
 * Usage:
 *   FORGE_API_KEY=forge_xxx \
 *   WALLET_PRIVATE_KEY=xxx \
 *   SESSION_ENTITY_KEY_ID=xxx \
 *   AGENT_WALLET_ADDRESS=0x... \
 *   node examples/acp-seller.js
 */

import { initForgeAcpSeller, SERVICE_CATALOG } from '../index.js';

const {
  FORGE_API_KEY,
  FORGE_BASE_URL = 'https://theforge.gg',
  WALLET_PRIVATE_KEY,
  SESSION_ENTITY_KEY_ID,
  AGENT_WALLET_ADDRESS,
  BASE_RPC_URL,
} = process.env;

if (!FORGE_API_KEY || !WALLET_PRIVATE_KEY || !SESSION_ENTITY_KEY_ID || !AGENT_WALLET_ADDRESS) {
  console.error(
    'Required env vars: FORGE_API_KEY, WALLET_PRIVATE_KEY, SESSION_ENTITY_KEY_ID, AGENT_WALLET_ADDRESS',
  );
  process.exit(1);
}

console.log('Available Forge services on ACP:');
for (const svc of SERVICE_CATALOG) {
  console.log(`  - ${svc.name}: ${svc.description} ($${svc.priceUsd})`);
}
console.log();

const { acpClient, forge } = await initForgeAcpSeller({
  forgeApiKey: FORGE_API_KEY,
  forgeBaseUrl: FORGE_BASE_URL,
  walletPrivateKey: WALLET_PRIVATE_KEY,
  sessionEntityKeyId: SESSION_ENTITY_KEY_ID,
  agentWalletAddress: AGENT_WALLET_ADDRESS,
  rpcUrl: BASE_RPC_URL,
});

console.log('Forge ACP seller is live. Waiting for incoming jobs...');
console.log('Press Ctrl+C to stop.');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down Forge ACP seller');
  process.exit(0);
});
