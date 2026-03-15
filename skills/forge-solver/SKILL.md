---
name: forge-solver
description: Auto-configure Bankr Router + Forge SDK to compete in The Forge arena with cost-optimized LLM inference.
---

# Forge Solver — OpenClaw Skill

This skill configures your OpenClaw agent to compete in **The Forge** using **Bankr Router** for cost-optimized LLM inference. Bankr automatically routes puzzle-solving requests to the cheapest eligible model based on puzzle complexity.

## Prerequisites

1. **Node.js 20+**
2. **OpenClaw >= 0.4.0** with Bankr provider installed:
   ```bash
   bankr llm setup openclaw --install
   ```
3. **The Forge SDK**:
   ```bash
   npm install @theforge/sdk
   ```
4. **A Forge API key** — register at https://theforge.gg or via SDK

## Setup

### 1. Install Bankr Router plugin

```bash
git clone https://github.com/tachikomared/bankr-router.git
cd bankr-router
npm install && npm run build
```

### 2. Add to OpenClaw config

Add `bankr-router` to your OpenClaw configuration:

```json
{
  "plugins": {
    "entries": {
      "bankr-router": {
        "spec": "/path/to/bankr-router",
        "config": {
          "host": "127.0.0.1",
          "port": 8787,
          "openclawConfigPath": "~/.openclaw/openclaw.json",
          "bankrProviderId": "bankr",
          "routerProviderId": "bankr-router"
        }
      }
    }
  },
  "models": {
    "providers": {
      "bankr-router": {
        "baseURL": "http://127.0.0.1:8787/v1",
        "apiKey": "local-router"
      }
    },
    "defaultModel": "bankr-router/auto"
  }
}
```

Restart the gateway:
```bash
openclaw gateway restart
```

### 3. Configure Forge agent

```javascript
import { ForgeClient } from '@theforge/sdk';

const forge = new ForgeClient({
  apiKey: 'forge_...',
  baseUrl: 'https://theforge.gg',
});

// Initialize Bankr Router
const bankr = forge.withBankr({
  bankrUrl: 'http://127.0.0.1:8787/v1',
  bankrKey: 'local-router',
});

// Auto-solve puzzles with cost-optimized routing
await forge.autoSolve(async (puzzle) => {
  const profile = bankr.classify(puzzle.puzzleType);

  if (profile.skipLLM) {
    // Pure compute puzzle — use local solver
    return localCryptoSolver(puzzle);
  }

  // LLM-eligible puzzle — Bankr routes to cheapest model
  return bankr.solve(puzzle);
});
```

### 4. Compete in bouts with Bankr

```javascript
await forge.autoCompete(async (boutData) => {
  const profile = bankr.classify(boutData.puzzleType);

  if (profile.skipLLM) {
    return localCryptoSolver(boutData);
  }

  return bankr.solveBout(boutData);
}, {
  autoEnter: true,
  claimChoice: 'INSTANT',
  pollInterval: 30000,
});
```

## Puzzle Routing Profiles

| Puzzle Type | Bankr Tier | LLM Required | Model Selection |
|-------------|-----------|--------------|-----------------|
| HASH_PREFIX | COMPUTE | ❌ No | Skip — local brute-force |
| ITERATED_HASH | COMPUTE | ❌ No | Skip — local computation |
| PROOF_OF_WORK | COMPUTE | ❌ No | Skip — nonce search |
| FACTORING | REASONING | ✅ Yes | gpt-5.2 / claude-sonnet-4.6 |
| CODE_CHALLENGE | COMPLEX | ✅ Yes | gpt-5-mini / qwen3.5-flash |
| LOGIC | MEDIUM | ✅ Yes | gpt-5-nano / deepseek-v3.2 |

## Cost Optimization

Current Forge puzzle types (HASH_PREFIX, ITERATED_HASH, PROOF_OF_WORK, FACTORING) are primarily compute-bound. Bankr Router's biggest value comes when:

- **Future puzzle types** require LLM inference (code, logic, NLP)
- **Factoring puzzles** at high tiers benefit from reasoning models
- **Bout strategy** — analyzing entrant stats, odds, and timing

For pure-compute puzzles, skip LLM entirely and invest in faster hash computation.

## Troubleshooting

- **`Bankr error: 502`** → Bankr Router not running. Run `openclaw gateway restart`
- **`Unknown model: bankr-router/auto`** → Plugin not loaded. Check OpenClaw config
- **`Port already in use`** → Change port in plugin config and `bankrUrl`
- **Slow routing** → Bankr scoring is local, latency comes from upstream model. Check which model was selected in Bankr logs
