# Agent D — Route Rewrite Handoff Plan

> **Purpose**: Self-contained handoff for a fresh agent to complete the on-chain migration route rewrites. Blocked on deployed contract addresses (Doppler ForgeToken launch → deploy ArenaVault, VictoryEscrow, ForgeBonds, ForgeArena v2 → set env vars → begin).

---

## Architecture — Chain-First Pattern

Every token-touching endpoint must follow this flow:

```
API request → validate → call src/chain/*.js → await receipt → update DB (cache only) → respond
```

The chain is **source of truth** for all balances, yields, and bond state. The DB is a read cache synced by the event indexer (`src/chain/events.js`).

> [!IMPORTANT]
> Never update `wallet.balance` in DB — it was removed from schema. Read balance via `src/chain/token.js → balanceOf(address)`. The `BalanceCache` table is auto-updated by the Transfer event listener.

---

## Prerequisites (must be done before route rewrites)

1. **ForgeToken deployed on Doppler** → gives us the token address
2. **Deploy contracts** in order: ArenaVault → VictoryEscrow → ForgeBonds → ForgeArena v2
3. **Wire contracts**: `arena.setArenaVault()`, `arena.setVictoryEscrow()`, `escrow.setForgeBonds()`, `vault.setDepositor(arena)`
4. **Set env vars** on Railway:
   - `FORGE_TOKEN_ADDRESS`
   - `ARENA_VAULT_ADDRESS`
   - `FORGE_ARENA_ADDRESS`
   - `VICTORY_ESCROW_ADDRESS`
   - `FORGE_BONDS_ADDRESS`
   - `DEPLOYER_ADDRESS`
   - `PRIVATE_KEY`
   - `BASE_RPC_URL`
5. **Run Prisma migration**: `npx prisma migrate dev --name on-chain-migration`

---

## New Chain Module API (`src/chain/`)

The agent should import from these files, **not** the old `chain.js`:

| Module | Key Exports |
|--------|-------------|
| [index.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/index.js) | `chainReady`, `forgeToken`, `forgeArena`, `arenaVault`, `victoryEscrow`, `forgeBonds`, `provider`, `deployerWallet`, `uuidToBytes32`, `bytes32ToUuid` |
| [tx.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/tx.js) | `submitTx(txFn, label, opts)` — nonce-managed with retry |
| [arena.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/arena.js) | `createBout`, `setBoutLive`, `cancelBout`, `enterBoutFor`, `placeBetFor`, `resolveAndEscrow`, `resolveBout`, `getBout`, `getEntrants`, `getBets` |
| [escrow.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/escrow.js) | `claimInstantFor`, `claimAsBondFor`, `getEscrow`, `getEscrowCount`, `getEscrows` |
| [bonds.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/bonds.js) | `buyBondFor`, `claimYieldFor`, `expireBond`, `fundYieldPool`, `getBond`, `pendingYield`, `getActiveBonds`, `getCurrentAprBps`, `getYieldPool` |
| [vault.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/vault.js) | `depositYield`, `getPosition`, `totalStaked`, `activeStakerCount`, `getClaimable`, `getPendingYield`, `getRageQuitCost` |
| [token.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/token.js) | `balanceOf`, `totalSupply`, `allowance` |
| [events.js](file:///Users/xodivcxode/Desktop/repos/mcp/the-forge/src/chain/events.js) | `startEventIndexer` — already called in server.js |

---

## File-by-File Rewrite Instructions

### 1. `src/middleware/auth.js` (51 lines)

**Current**: Looks up wallet by apiKey, attaches `req.wallet` (including old `balance`/`gas` fields).

**Changes**:
- Wallet no longer has `balance` or `gas` — these are gone from schema
- Add optional `req.wallet.chainBalance` by calling `balanceOf(wallet.address)` for routes that need it
- Add `requireChain` middleware that rejects requests if `!chainReady`
- Reject wallets with no `address` set (shouldn't happen now that address is required, but guard)

```diff
+ import { balanceOf } from '../chain/token.js';
+ import { chainReady } from '../chain/index.js';
+
+ export function requireChain(req, res, next) {
+     if (!chainReady) return res.status(503).json({ error: 'Chain not available' });
+     next();
+ }
```

---

### 2. `src/routes/wallet.js` (125 lines)

**Stale refs**: `wallet.balance` (lines 45, 75, 76, 90, 91, 105), `wallet.gas` (line 46, 76, 91), `config.game.initialGas`, `config.game.initialBalance`

**Changes**:
- **POST /register**: Remove `balance` and `gas` from `prisma.wallet.create()`. Require `address` in request body. Registration no longer grants DB balance — agent must receive tokens on-chain (owner transfer or purchase)
- **GET /balance**: Replace `w.balance` with `await balanceOf(w.address)`. Remove `gas` from response
- **GET /profile/:name**: Replace `balance` select with on-chain `balanceOf(wallet.address)`. Remove `balance` from Prisma select

```diff
- import config from '../config.js';
+ import config from '../config.js';
+ import { balanceOf } from '../chain/token.js';

  const registerSchema = z.object({
      name: z.string()...
+     address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid Ethereum address'),
  });

  // POST /register
- data: { name, apiKey, balance: startingBalance, gas: config.game.initialGas },
+ data: { name, apiKey, address: parsed.data.address },

  // GET /balance
- res.json({ id: w.id, name: w.name, balance: w.balance, gas: w.gas, reputation: w.reputation });
+ const balance = await balanceOf(w.address);
+ res.json({ id: w.id, name: w.name, balance: balance.toString(), address: w.address, reputation: w.reputation });
```

Add new endpoint:
```js
// GET /contracts — return deployed contract addresses
router.get('/contracts', (req, res) => {
    const c = config.chain;
    res.json({
        forgeToken: c.forgeTokenAddress,
        forgeArena: c.forgeArenaAddress,
        arenaVault: c.arenaVaultAddress,
        victoryEscrow: c.victoryEscrowAddress,
        forgeBonds: c.forgeBondsAddress,
    });
});
```

---

### 3. `src/routes/bouts.js` (819 lines) — **HEAVIEST**

**Stale refs**: `settleBurn` import (line 10), `wallet.balance` (lines 170, 172, 177, 179, 300, 301, 327)

**Changes**:
- **Import**: `import { settleBurn } from '../chain.js'` → DELETE. Import from `src/chain/arena.js` and `src/chain/token.js` and `src/chain/escrow.js`
- **POST /:id/enter**: 
  - Replace `wallet.balance < entryFee` check with `await balanceOf(wallet.address) < entryFeeWei`
  - Replace DB `balance: { decrement }` with `await enterBoutFor(boutId, wallet.address)` — contract handles transfer+burn
  - Keep DB BoutEntrant record as cache
- **POST /:id/bet**:
  - Replace DB balance check/decrement with `await placeBetFor(boutId, wallet.address, entrantIdx, amountWei)`
  - Keep DB Bet record as cache
- **POST /:id/claim (victory)**:
  - INSTANT choice: Replace DB `balance: { increment }` + `settleBurn()` with `await claimInstantFor(boutId, escrowIdx, wallet.address)`
  - OTC_BOND choice: Replace DB bond creation with `await claimAsBondFor(boutId, escrowIdx, wallet.address, discountBps, expiryTimestamp)`
  - In both cases, the on-chain receipt is confirmation — then update DB cache

> [!CAUTION]
> The victory claim flow is the most complex rewrite. The current code (lines 582-791) creates DB bonds and updates balances. The new flow should: call escrow → if INSTANT, call `claimInstantFor` → parse events from receipt for burn/net amounts → record in DB. If OTC_BOND, call `claimAsBondFor` → parse `BondCreated` event for bondId → store `onChainBondId` in DB VictoryBond.

---

### 4. `src/routes/bonds.js` (421 lines)

**Stale refs**: `accruedYield` (lines 40, 75, 119, 226, 229, 234, 250, 303, 346, 348, 357)

**Changes**:
- **GET /** and **GET /:id**: Replace `bond.accruedYield` with `await pendingYield(bond.onChainBondId)` from `src/chain/bonds.js`
- **POST /:id/buy**: Replace DB `wallet.balance` deduct/credit with `await buyBondFor(onChainBondId, amountWei, wallet.address)`. Agent must have approved ForgeBonds contract for the discounted amount
- **POST /:id/claim-yield**: Replace DB `accruedYield` read/reset with `await claimYieldFor(onChainBondId, wallet.address)`. Yield is calculated lazily on-chain — no DB field to reset
- Remove all `accruedYield` from Prisma queries (field was removed from schema)

---

### 5. `src/routes/vault.js` (344 lines)

**Stale refs**: `wallet.balance` (lines 145, 146), `balance: { decrement }` (line 184), `balance: { increment }` (line 268)

**Changes**:
- **GET /info**: Replace DB aggregation (`stakePosition.findMany`) with `await totalStaked()` and `await activeStakerCount()` from `src/chain/vault.js`
- **GET /me**: Replace DB position lookup with `await getPosition(wallet.address)` from chain
- **POST /stake**: Replace DB `balance: { decrement }` with on-chain call. Agent must approve ArenaVault, then backend relays (or agent calls directly). The ArenaVault contract handles the transfer
- **POST /unstake**: Replace DB `balance: { increment }` with on-chain call. Agent calls `arenaVault.unstake()` directly (no relay needed — it's their own stake)

> [!NOTE]
> Staking/unstaking may work differently than other routes. Since ArenaVault doesn't have relay `*For` functions, agents must call `stake()` and `unstake()` directly from their own wallet. The backend just reads state.

---

### 6. `src/routes/transfer.js` (92 lines)

**Stale refs**: `wallet.gas` (line 26), `gasCostTransfer` (lines 26, 27, 49, 71), `wallet.balance` (lines 30, 31), `balance: { decrement }` (line 48), `balance: { increment }` (line 55)

**Changes**: This entire route is **likely deletable** post-migration. On-chain, agents transfer FORGE via standard ERC20 `transfer()` — no backend involvement. If kept for API-key agents who can't sign transactions, it would need to use `forgeToken.transferFrom(agent, recipient, amount)` with agent approval.

Consider: **DELETE this file and remove from server.js**, or add a relay `transferFor()` that does `forgeToken.transferFrom()` on behalf of the agent.

---

### 7. `src/routes/admin.js`

**Stale refs**: `wallet.balance` (lines 125, 152)

**Changes**: Remove balance adjustment endpoints (admin can't modify on-chain balances). Keep stats endpoints but read from chain. The `POST /admin/balance` endpoint that manually adjusts balances must be deleted or replaced with a treasury transfer function.

---

### 8. `src/routes/leaderboard.js`

**Changes**: Remove any balance-based sorting. Leaderboard should rank by `reputation`, solve count, or bout placements — not token balance (which is on-chain and not in DB).

---

### 9. `src/jobs/bout-scheduler.js` (345 lines) — **CRITICAL**

**Stale refs**: Line 18 `import { forgeArena, chainReady, uuidToBytes32, acquireTxLock, releaseTxLock, sendTx } from '../chain.js'`

**Changes**:
- Replace import with: `import { chainReady, uuidToBytes32 } from '../chain/index.js'` and `import * as chainArena from '../chain/arena.js'`
- **BETTING → LIVE**: Replace `sendTx(() => forgeArena.createBout(...))` with `await chainArena.createBout(bout.id, entryFeeWei, chainConfig)`
- **RESOLVING → RESOLVED**: Replace `sendTx(() => forgeArena.resolveBout(...))` with `await chainArena.resolveAndEscrow(bout.id, placements)` — this is the critical change that routes payouts to VictoryEscrow instead of pull-claim
- Remove `acquireTxLock`/`releaseTxLock` calls — `submitTx` in `tx.js` handles locking internally
- Remove all `prisma.wallet.update({ data: { balance: ... } })` operations — chain handles token flow

---

### 10. `src/jobs/bootstrap.js` (228 lines)

**Stale refs**: Line 16 `import { forgeToken, arenaVault, chainReady, acquireTxLock, releaseTxLock, sendTx } from '../chain.js'`

**Changes**:
- Replace import with: `import { chainReady } from '../chain/index.js'` and `import { depositYield } from '../chain/vault.js'`
- Replace manual `sendTx(() => forgeToken.approve(...))` + `sendTx(() => arenaVault.depositYield(...))` with single `await depositYield(emittedWei)` — vault.js handles approval internally
- **Vesting credits** (lines 141-145): Remove `prisma.wallet.update({ data: { balance: { increment } } })` — vested rewards are claimed on-chain via `arenaVault.claimYield()`

---

## Files to Delete

| File | Reason |
|------|--------|
| `src/chain.js` | Replaced by `src/chain/` module |
| `src/jobs/bond-yield.js` | Yield is lazy on-chain, no cron needed |
| `src/jobs/settlement.js` | No fire-and-forget, all txs awaited |
| `src/seed-missing-agents.js` | References `wallet.balance` |
| `src/seed-production.js` | References `wallet.balance` |

---

## Stale Reference Inventory (from grep audit)

```
STALE IMPORT — old chain.js:
  src/jobs/bout-scheduler.js:18
  src/jobs/bootstrap.js:16
  src/routes/bouts.js:10

STALE — wallet.balance (removed from schema):
  src/routes/bouts.js: 170, 172, 177, 179, 300, 301
  src/routes/vault.js: 145, 146
  src/routes/transfer.js: 30, 31
  src/routes/wallet.js: 45, 76, 90, 91, 105
  src/routes/admin.js: 125, 152
  src/routes/puzzles.js: 47, 48, 145, 146
  src/jobs/bootstrap.js: 144

STALE — wallet.gas / gasCost* (removed):
  src/routes/puzzles.js: 42, 43, 73, 87, 142, 143, 172, 186, 315, 316, 336, 341, 389, 390, 425, 431
  src/routes/transfer.js: 26, 27, 49, 71
  src/routes/wallet.js: 46, 76, 91

STALE — accruedYield (removed from VictoryBond):
  src/routes/bonds.js: 40, 75, 119, 226, 229, 234, 250, 303, 346, 348, 357

STALE — settleBurn (deleted function):
  src/routes/bouts.js: 10, 698, 699
```

---

## Conflict Zones

| Zone | Risk | Mitigation |
|------|------|------------|
| `server.js` | Already updated (Agent C). Agent D should NOT touch imports — they're correct | Don't re-add deleted job imports |
| `src/chain/` directory | Already complete (Agent B). Agent D should import from these, not modify | Read-only for Agent D |
| `prisma/schema.prisma` | Already migrated (Agent B). May need additional migration if Agent D discovers new fields needed | Use `prisma migrate dev` |
| `src/routes/puzzles.js` | Heavy gas/balance usage — needs separate review for puzzle-specific migration | Gas system removed, balance checks need chain reads |

---

## Testing Checklist

After route rewrites, verify:
- [ ] `forge test --summary` still passes (90/90)
- [ ] `npx prisma validate` still passes
- [ ] `npm run dev` starts without import errors
- [ ] `POST /api/register` creates wallet with address (no balance)
- [ ] `GET /api/balance` returns on-chain balance
- [ ] `POST /api/bouts/:id/enter` calls `enterBoutFor` on-chain
- [ ] `POST /api/bouts/:id/bet` calls `placeBetFor` on-chain
- [ ] `POST /api/bouts/:id/claim` calls escrow correctly
- [ ] `POST /api/bonds/:id/buy` calls `buyBondFor` on-chain
- [ ] Bout scheduler uses `resolveAndEscrow` (not `resolveBout`)
- [ ] Bootstrap job uses `depositYield` from new chain module
- [ ] No remaining references to old `chain.js`
- [ ] No remaining references to `wallet.balance` or `wallet.gas`
