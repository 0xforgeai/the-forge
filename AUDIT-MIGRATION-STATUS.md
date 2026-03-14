# On-Chain Migration — Audit Summary
> Generated 2026-03-13T12:59

## Migration Status

| Layer | Status | Notes |
|-------|--------|-------|
| Solidity contracts | ✅ **Done** | 90/90 tests, deploy blocked on Doppler |
| Prisma schema | ✅ **Done** | `balance`/`gas` removed, `SettlementTask` deleted |
| `src/chain/` module | ✅ **Done** | 8 files, replaces old `chain.js` |
| `src/config.js` | ✅ **Done** | New contract addresses, gas costs removed |
| `src/server.js` | ✅ **Done** | Dead imports removed, event indexer added |
| `src/jobs/supply-invariant.js` | ✅ **Done** | Simplified to on-chain totalSupply |
| `src/jobs/expiry.js` | ✅ **Done** | Bond expiry trigger added |
| Route rewrites | ❌ **Pending** | Blocked on deployed addresses |

## Import Health

### ✅ Clean imports (using new `src/chain/`)
- `src/server.js` → `chain/index.js`, `chain/events.js`
- `src/jobs/supply-invariant.js` → `chain/token.js`, `chain/index.js`
- `src/jobs/expiry.js` → dynamic import `chain/index.js`, `chain/bonds.js`

### ❌ Stale imports (still using old `chain.js`)
- `src/jobs/bout-scheduler.js:18` — `from '../chain.js'`
- `src/jobs/bootstrap.js:16` — `from '../chain.js'`
- `src/routes/bouts.js:10` — `import { settleBurn } from '../chain.js'`

### 🗑️ Files to delete (disconnected, imports removed)
- `src/jobs/bond-yield.js`
- `src/jobs/settlement.js`
- `src/chain.js` (old monolith, replaced by `src/chain/`)

## Stale DB Field References

| Field | Files Still Referencing |
|-------|----------------------|
| `wallet.balance` | `wallet.js`, `bouts.js`, `bonds.js`, `vault.js`, `transfer.js`, `puzzles.js`, `admin.js`, `bootstrap.js` |
| `wallet.gas` | `wallet.js`, `puzzles.js`, `transfer.js` |
| `gasCost*` | `puzzles.js`, `transfer.js` |
| `accruedYield` | `bonds.js` (10 refs) |
| `settleBurn()` | `bouts.js` |

> [!WARNING]
> These stale references will cause runtime errors after Prisma migration runs. They are safe right now because migration hasn't been applied yet. Agent D must fix all before deploying.

## Full Handoff

See [HANDOFF-AGENT-D.md](file:///Users/xodivcxode/.gemini/antigravity/brain/8d0d69e5-3923-4d01-b9ed-4d107aee40d3/HANDOFF-AGENT-D.md) for complete file-by-file rewrite instructions.
