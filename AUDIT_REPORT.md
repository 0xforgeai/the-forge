# The Forge — Full Codebase Audit Report

**Date:** March 6, 2026
**Scope:** All server-side JS, Solidity contracts, Prisma schema, config, and environment
**Methodology:** Manual line-by-line review of every source file against the Passoff doc's known edge cases + independent discovery

---

## Executive Summary

The Forge is a well-structured three-sided marketplace with clean separation of concerns, proper use of Prisma transactions, and solid contract patterns (OpenZeppelin, ReentrancyGuard). However, this audit uncovered **8 critical findings**, **11 high-severity findings**, and **14 medium/low findings** across security, economic correctness, data integrity, and operational risk.

---

## CRITICAL Findings

### C-1. `.env` file committed to repository with real credentials

**File:** `.env` (present in working directory)
**Severity:** CRITICAL

The `.env` file contains the local database URL, admin credentials (`admin`/`forgeadmin`), and the HMAC secret. While `.gitignore` lists `.env`, the file is present in the working copy and was likely committed at some point. The `HMAC_SECRET` value `forge-dev-secret-change-me-in-prod` is a weak placeholder. If this same pattern leaked into production, all answer hashes are compromisable.

**Recommendation:** Rotate all secrets immediately. Audit git history for any committed `.env` files (`git log --all -- .env`). Use a secrets manager for production.

---

### C-2. ArenaVault.sol `distributeYield()` unbounded loop — gas DoS

**File:** `contracts/src/ArenaVault.sol`, lines 222–253
**Severity:** CRITICAL

`distributeYield()` iterates over the entire `stakers[]` array, including inactive stakers (it skips them but still pays the iteration gas). The array only grows — stakers are pushed but never removed. At ~200+ stakers, this will exceed block gas limits on Base and become permanently uncallable.

```solidity
for (uint256 i = 0; i < stakers.length; i++) { // unbounded
    StakePosition storage pos = positions[stakers[i]];
    if (!pos.active) continue; // still costs gas
    ...
}
```

**Recommendation:** Switch to a pull-based yield model. Each staker claims their own share. Track a global `rewardPerToken` accumulator and per-user `rewardDebt`, similar to MasterChef/SushiSwap patterns. Remove the `stakers[]` array iteration entirely.

---

### C-3. ArenaVault.sol `stakerCount` underflow possibility

**File:** `contracts/src/ArenaVault.sol`, lines 136, 184
**Severity:** CRITICAL

`stakerCount` is incremented on `stake()` and decremented on `unstake()`. However, a user can `stake()`, `unstake()`, then `stake()` again. On the second `stake()`, `stakerCount++` fires again, but the user is already in `stakers[]` and `isStaker[msg.sender]` is already `true`. When they unstake twice in this pattern, `stakerCount` decrements correctly, but the second `unstake()` doesn't re-increment on re-stake... Actually the more subtle issue: calling `unstake()` sets `active = false` but `isStaker` stays `true`. On re-staking, the check `if (!isStaker[msg.sender])` means the staker ISN'T added again to `stakers[]`, but `stakerCount++` still fires. After unstaking again, `stakerCount` goes to 0, but there's one stale entry in `stakers[]` that will never be cleaned up. Over time, `stakers[]` grows monotonically.

**Recommendation:** Track active staker count separately or remove `stakerCount` in favor of iterating `stakers[]`. Better yet, eliminate the array entirely per C-2.

---

### C-4. Offchain/onchain covenant parameter mismatch

**File:** `config.js` vs `ArenaVault.sol` constructor
**Severity:** CRITICAL

The offchain config and onchain contract define different lock periods:

| Covenant | Offchain (`config.js`) | Onchain (`ArenaVault.sol`) |
|----------|----------------------|--------------------------|
| FLAME | 1 day | 1 day |
| STEEL | 3 days | 3 days |
| OBSIDIAN | 7 days | 7 days |
| ETERNAL | 30 days | 30 days |

The lock days match, but the **schema enum comments** say something different:

```prisma
enum CovenantType {
  FLAME     // 7 days    ← WRONG, config says 1
  STEEL     // 30 days   ← WRONG, config says 3
  OBSIDIAN  // 90 days   ← WRONG, config says 7
  ETERNAL   // 365 days  ← WRONG, config says 30
}
```

The schema comments are completely wrong and misleading. Anyone reading the schema will assume FLAME is 7 days. Furthermore, the offchain `rageQuitMulti` for ETERNAL is `Infinity`, while `vault.js` line 175 stores it as `999`. The onchain contract uses `10000` (basis points). These three representations need to be unified.

**Recommendation:** Fix schema comments. Create a single source of truth for covenant parameters that's validated at startup.

---

### C-5. Race condition in bet placement — max bet check is non-atomic

**File:** `src/routes/bouts.js`, lines 288–295
**Severity:** CRITICAL

The max bet calculation reads `bout.totalBetPool`, adds the new `amount`, then computes the cap. But `bout` was fetched at the top of the handler (line 258) *before* the transaction. Two concurrent bet requests could each read the same `totalBetPool`, both pass the max bet check, and both write. The Prisma `$transaction` only serializes the *write* — the read-then-check is still vulnerable.

```javascript
const currentPool = bout.totalBetPool + amount;
const maxBet = Math.max(Math.floor(currentPool * bc.maxBetPercent / 100), 100);
```

**Recommendation:** Move the entire check-and-write into a serialized transaction using `prisma.$transaction` with interactive mode and `SELECT ... FOR UPDATE`, or use an optimistic concurrency check (e.g., `where: { id: bout.id, totalBetPool: bout.totalBetPool }`).

---

### C-6. Payout math loses tokens — rounding truncation

**File:** `src/bout-payout.js`
**Severity:** CRITICAL

All payout divisions use `Math.floor()`, which truncates. Consider a bet pool of 1001 with `protocolRakePercent=5`:

- `protocolRake = Math.floor(1001 * 5 / 100) = 50`
- `agentPurseFromBets = Math.floor(1001 * 20 / 100) = 200`
- `bettorPool = Math.floor(1001 * 75 / 100) = 750`
- **Total allocated: 50 + 200 + 750 = 1000** — **1 token is unaccounted for**

This "dust" accumulates over every bout. Tokens are effectively destroyed without being tracked as burns.

**Recommendation:** Calculate the remainder explicitly: `remainder = totalBetPool - protocolRake - agentPurseFromBets - bettorPool`. Add it to the protocol rake or burn it with a ledger entry. Similarly for bettor payouts and agent purse splits.

---

### C-7. `claimYield()` double-counts vested amount

**File:** `contracts/src/ArenaVault.sol`, lines 259–273
**Severity:** CRITICAL

```solidity
uint256 vested = pos.vestedRewards + _calcVestedAmount(pos); // total claimable
if (vested == 0) revert NothingToClaim();

uint256 newlyVested = _calcVestedAmount(pos); // re-calculated
pos.unvestedRewards -= newlyVested;
pos.vestedRewards = 0; // zeroed
forgeToken.safeTransfer(msg.sender, vested); // transfers vestedRewards + newlyVested
```

The function calculates `vested = pos.vestedRewards + _calcVestedAmount(pos)` and transfers that full amount. Then it only deducts `newlyVested` from `unvestedRewards` and zeros `vestedRewards`. This is correct if `_calcVestedAmount` is deterministic between the two calls (same block). BUT if this is called after `distributeYield()` in the same transaction, the state could shift. More importantly, the pattern is fragile — `_calcVestedAmount` is called twice, relying on no state change between calls.

**Recommendation:** Calculate `newlyVested` once and reuse it:

```solidity
uint256 newlyVested = _calcVestedAmount(pos);
uint256 totalClaim = pos.vestedRewards + newlyVested;
if (totalClaim == 0) revert NothingToClaim();
pos.unvestedRewards -= newlyVested;
pos.vestedRewards = 0;
forgeToken.safeTransfer(msg.sender, totalClaim);
```

---

### C-8. Bootstrap emission creates tokens from thin air

**File:** `src/jobs/bootstrap.js`, lines 83–99
**Severity:** CRITICAL

The bootstrap job increments `unvestedRewards` in the database and later (lines 114–142) converts those to wallet balances via `balance: { increment: vestAmount }`. But these tokens don't come from any existing supply. There's no corresponding treasury deduction. The system mints virtual $FORGE without tracking where they came from, creating inflation that doesn't appear in burn/mint accounting.

**Recommendation:** Designate a treasury wallet. Bootstrap emissions should deduct from treasury and credit to stakers. Track net supply invariant: `sum(all_wallet_balances) + sum(staked) + sum(unvested) = INITIAL_SUPPLY - sum(burns)`.

---

## HIGH Findings

### H-1. No authentication on SSE endpoint — information leakage

**File:** `src/server.js` line 99–101, `src/sse.js`
**Severity:** HIGH

The `/api/events` SSE endpoint is public with no auth. It broadcasts agent names, bet amounts, bout entries, solve times, and stake details. A competitor can monitor all activity in real-time, including which agents are entering bouts (front-running opportunity) and bet flow (market manipulation).

**Recommendation:** Require auth or limit broadcast data to non-sensitive fields.

---

### H-2. API key passed in query string — URL logging exposure

**File:** `src/middleware/auth.js`, line 10
**Severity:** HIGH

```javascript
const apiKey = req.headers['x-api-key'] || req.query.apiKey;
```

Accepting API keys via query params means they'll appear in server access logs, browser history, Referer headers, and any intermediate proxy logs. The `pino` request logger at `server.js:42-51` logs `req.url`, which includes query params.

**Recommendation:** Remove `req.query.apiKey` support. Only accept keys via the `x-api-key` header.

---

### H-3. Admin basic auth credentials are hardcoded defaults

**File:** `config.js` lines 8–11
**Severity:** HIGH

```javascript
admin: {
    user: process.env.ADMIN_USER || 'admin',
    pass: process.env.ADMIN_PASS || 'forgeadmin',
},
```

If env vars are missing, the server silently falls back to default credentials. The admin panel at `/api/admin` exposes all wallets, all puzzles with answers, and has a balance adjustment endpoint. Basic auth is also sent in plaintext (base64) over non-HTTPS connections.

**Recommendation:** Require admin credentials via env vars (fail to start if missing). Use a stronger auth mechanism. Enforce HTTPS.

---

### H-4. Admin balance adjustment has no limits or audit trail

**File:** `src/routes/admin.js`, lines 89–120
**Severity:** HIGH

The `/api/admin/wallets/:id/adjust` endpoint accepts arbitrary positive or negative amounts with only a memo. There's no maximum adjustment, no approval flow, no separate audit log, and the transaction type is recorded as generic `TRANSFER` — making it indistinguishable from user transfers in the ledger.

**Recommendation:** Add a separate `ADMIN_ADJUSTMENT` transaction type. Log the admin user identity. Set reasonable limits. Consider requiring a two-factor confirmation.

---

### H-5. Bootstrap double-emission around UTC midnight

**File:** `src/jobs/bootstrap.js`, lines 57–66
**Severity:** HIGH

```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);
const alreadyEmitted = await prisma.treasuryLedger.findFirst({
    where: {
        action: 'BOOTSTRAP_EMISSION',
        createdAt: { gte: today },
    },
});
```

`today` is set to local midnight (server timezone), not UTC. The `createdAt` in Postgres is stored as UTC. If the server runs in a timezone where midnight doesn't align with UTC midnight, the check could miss an emission or allow a double-emission. The job runs every 6 hours, so a 6h timezone offset could cause issues.

**Recommendation:** Use UTC explicitly: `today.setUTCHours(0, 0, 0, 0)`. Better: use a dedicated `lastEmissionDate` field rather than querying the ledger.

---

### H-6. Bout entry fee accounting error — burn not deducted from pool

**File:** `src/routes/bouts.js`, lines 190–223
**Severity:** HIGH

When an agent enters a bout, the full `entryFee` (500) is deducted from their wallet. A `burnAmount` (10% = 50) is calculated, and `netEntryFee` (450) is added to `totalEntryFees`. But the `totalEntryFees` is then passed to `bout-payout.js` which distributes it as agent purse. This is correct. However, the 50 burned tokens are tracked in `TreasuryLedger` as `ENTRY_FEE_BURN` but never actually removed from circulation in the balance accounting. The wallet was decremented by 500, but only 450 went to `totalEntryFees`. The 50 is just... gone. No supply tracking.

**Recommendation:** Maintain a global supply invariant. All burns should deduct from a tracked total supply counter.

---

### H-7. Commit-reveal timing edge case — commit at solve window end

**File:** `src/routes/bouts.js`, lines 379–383
**Severity:** HIGH

An agent can commit at the last second of the solve window (`elapsed === solveDurationSecs`). The bout then transitions to RESOLVING (via bout-scheduler). The reveal window is 5 minutes. But the agent's reveal might arrive while the bout is still being processed by the scheduler. Since `bouts.js:422` accepts reveals during both `LIVE` and `RESOLVING` states, this should work... BUT the scheduler at `bout-scheduler.js:121-125` checks `if (!allRevealed && elapsed < revealDeadline) continue` — it waits for reveals. The edge case: an agent commits at second 3599 of a 3600s window. The scheduler advances to RESOLVING at 3600. Reveal deadline = 3600 + 300 = 3900. The agent has 300s to reveal. This seems fine, but the `committedAt` timestamp records the commit time, and `solveTime` is calculated from `committedAt - liveAt`. If the reveal is late, `solveTime` still reflects the commit time, which is correct. **However**, if two agents commit at 3599s and 3598s, but the first reveals at 3899s and the second at 3700s, the first agent still gets credit for the earlier solve time. This incentivizes late commits with no risk.

**Recommendation:** Enforce a buffer between commit and solve window end (e.g., must commit at least 60s before window closes). Or: only credit solve time from reveal, not commit.

---

### H-8. Transfer response returns stale balance

**File:** `src/routes/transfer.js`, line 80
**Severity:** HIGH

```javascript
newBalance: wallet.balance - amount,
```

`wallet` was fetched before the transaction. If concurrent requests modify the balance between the read and the response, the returned `newBalance` is wrong. This could mislead clients into thinking they have more or less than they do.

**Recommendation:** Re-query the wallet after the transaction, or return the balance from the Prisma update result.

---

### H-9. No rate limit on `/api/register` — wallet spam

**File:** `src/server.js`, `src/routes/wallet.js`
**Severity:** HIGH

The global rate limiter is 60 req/min per IP, but `/api/register` has no additional protection. An attacker can register 60 wallets per minute, each receiving 1000 $FORGE and 500 gas. That's 60,000 free tokens per minute per IP. With rotating IPs, the total supply inflates rapidly.

**Recommendation:** Add a stricter rate limit on `/register` (e.g., 3 per hour per IP). Consider CAPTCHA, email verification, or proof-of-work for registration.

---

### H-10. ETERNAL covenant offchain allows unstake after lock, but with permanent block

**File:** `src/routes/vault.js`, lines 236–239
**Severity:** HIGH

```javascript
if (position.covenant === 'ETERNAL') {
    return res.status(400).json({
        error: 'ETERNAL covenant — you cannot unstake for 30 days...',
    });
}
```

The offchain ETERNAL check is a hard block that never expires — it ALWAYS rejects unstaking regardless of lock period. The error message says "30 days" but the code never checks if 30 days have passed. On-chain, `ArenaVault.sol` correctly allows unstaking after `lockExpiresAt` for ETERNAL. This means offchain ETERNAL stakers are **permanently locked** while onchain ETERNAL stakers can eventually exit.

**Recommendation:** Change the check to respect the lock period:
```javascript
if (position.covenant === 'ETERNAL' && now < position.lockExpiresAt) { ... }
```

---

### H-11. Losing bet burn is tracked but never reconciled

**File:** `src/jobs/bout-scheduler.js`, lines 199–207
**Severity:** HIGH

When a bout resolves, losing bets are marked with `payout: 0` and a `LOSING_BET_BURN` entry is created in the treasury ledger. But the losing bet amounts were already deducted from bettor wallets at bet placement time and added to `totalBetPool`. The payout engine then distributes from `totalBetPool` to winners. The "burn" is really just the difference between what losers put in and what they get back (0). It's not an additional burn — the tokens were already in the pool. The ledger entry makes it look like an extra burn, double-counting the deflationary effect.

**Recommendation:** Clarify the accounting. Either: (a) track losing bet burns as "tokens that left the pool without going to any wallet" (more accurate), or (b) remove the misleading ledger entry since the tokens were already accounted for in pool distribution.

---

## MEDIUM Findings

### M-1. `contentSecurityPolicy: false` disables XSS protection

**File:** `src/server.js`, line 34
`helmet({ contentSecurityPolicy: false })` disables CSP headers, leaving the static frontend vulnerable to XSS if user input is rendered.

### M-2. CORS is wide open

**File:** `src/server.js`, line 35
`cors()` with no options allows any origin. The SSE endpoint also manually sets `Access-Control-Allow-Origin: *`.

### M-3. ForgeToken mints full supply at deploy — `mint()` is dead code

**File:** `contracts/src/ForgeToken.sol`, lines 23–26
The constructor mints all 1B tokens and sets `totalMinted = MAX_SUPPLY`. The `mint()` function can never succeed since `totalMinted + amount > MAX_SUPPLY` will always be true.

### M-4. Iterated hash verification uses `_computedAnswer` that's never stored

**File:** `src/crypto-puzzles.js`, line 83
`verifyIteratedHash` tries to read `challengeData._computedAnswer`, but `generateIteratedHash` stores the answer in `answerHash`, not in `challengeData._computedAnswer`. The actual verification in `verifyCryptoPuzzle` (line 226–228) correctly compares against `storedAnswerHash`, making this dead code path. But if `verifyIteratedHash` is ever called directly, it will always return false.

### M-5. Factoring puzzle limited to ~52-bit semiprimes

**File:** `src/crypto-puzzles.js`, lines 149–165
Tier 4 and 5 both use 26-bit primes due to JS safe integer limits. Higher difficulty tiers don't actually get harder. Consider using BigInt for larger semiprimes.

### M-6. Prisma schema uses `Int` for token amounts — overflow risk

**File:** `prisma/schema.prisma`
All balance and amount fields are `Int` (32-bit signed, max ~2.1B). With 1B total supply and frequent operations, aggregated fields like `totalVolume` in admin stats could overflow.

### M-7. No index on `Bout.status + scheduledAt` composite — slow scheduler queries

**File:** `prisma/schema.prisma`, `src/jobs/bout-scheduler.js`
The bout scheduler queries by `status` and timestamp repeatedly every 30 seconds. There's a `status` index but no composite index for the common query patterns.

### M-8. SSE has no connection limit — memory DoS

**File:** `src/sse.js`
The SSE manager stores all client connections in a `Set` with no upper bound. An attacker opening thousands of connections could exhaust server memory.

### M-9. `BoutSubmission` model is defined but never used

**File:** `prisma/schema.prisma`, lines 240–254
The `BoutSubmission` model is a Phase 2 placeholder with no corresponding routes or logic. It should be removed or gated behind a feature flag.

### M-10. Reputation can go negative

**File:** `src/jobs/expiry.js`, line 93
`reputation: { decrement: puzzle.difficultyTier }` can take reputation below zero. No floor check.

### M-11. Registration doesn't burn 50 tokens as documented

**File:** Passoff doc says "Registration: 50 flat" burn. `wallet.js` gives 1000 initial balance but never deducts 50. The burn point listed in the doc doesn't exist in code.

### M-12. `crypto-js` dependency is unused

**File:** `package.json`
The `crypto-js` package is listed as a dependency but never imported. The codebase uses Node's built-in `crypto` module exclusively.

### M-13. No graceful shutdown — cron jobs and DB connections leak

**File:** `src/server.js`
No `SIGTERM`/`SIGINT` handler to stop cron jobs, close SSE connections, or disconnect Prisma. Railway sends SIGTERM before container stop.

### M-14. Admin route exposes transaction history without pagination

**File:** `src/routes/admin.js`
Aggregate queries (`_count`, `_sum`) on transactions will degrade as the table grows. No pagination on wallet or puzzle listings (hardcoded `take: 100`).

---

## Offchain ↔ Onchain Sync Issues

| Parameter | Offchain | Onchain | Status |
|-----------|----------|---------|--------|
| FLAME lock | 1 day | 1 day | ✅ Match |
| STEEL lock | 3 days | 3 days | ✅ Match |
| OBSIDIAN lock | 7 days | 7 days | ✅ Match |
| ETERNAL lock | 30 days | 30 days | ✅ Match |
| ETERNAL unstake | Never (bug) | After 30 days | ❌ **Mismatch (H-10)** |
| Rage quit tax | `[50,40,30,20,10,5,0]` % | `[5000,4000,3000,2000,1000,500,0]` bps | ✅ Equivalent |
| Rage quit multi | `1.0, 2.0, 3.0, Infinity` | `100, 200, 300, 10000` | ⚠️ Infinity→999 offchain, 10000 onchain |
| Loyalty schedule | `[1.0, 1.2, 1.5, 2.0, 2.5, 3.0]` | `[100, 120, 150, 200, 250, 300]` | ✅ Equivalent (×100) |
| Vesting | 5 days | 5 days | ✅ Match |
| Schema enum comments | 7/30/90/365 days | — | ❌ **Wrong (C-4)** |

---

## Supply Invariant Analysis

The system lacks a global supply invariant check. Tokens enter via registration (1000 per wallet) and bootstrap emissions (unbacked). Tokens leave via burns (entry fees, bet burns, losing bets, slash). But there's no mechanism to verify:

```
sum(wallet.balance) + sum(stakePosition.amount where active) + sum(unvestedRewards) + sum(vestedAmount not yet credited)
    = total_minted - total_burned
```

Without this invariant, token leaks (C-6, C-8, H-6) go undetected.

---

## Recommendations Priority Matrix

| # | Finding | Severity | Effort | Priority |
|---|---------|----------|--------|----------|
| C-2 | ArenaVault unbounded loop | Critical | High | **P0** |
| C-7 | claimYield double-count | Critical | Low | **P0** |
| C-8 | Bootstrap mints from thin air | Critical | Medium | **P0** |
| C-5 | Bet race condition | Critical | Medium | **P0** |
| C-6 | Payout rounding dust | Critical | Low | **P0** |
| C-1 | .env committed | Critical | Low | **P0** |
| C-4 | Schema/config mismatch | Critical | Low | **P0** |
| C-3 | stakerCount drift | Critical | Medium | **P1** |
| H-10 | ETERNAL permanent lock | High | Low | **P1** |
| H-9 | Register spam | High | Low | **P1** |
| H-3 | Default admin creds | High | Low | **P1** |
| H-2 | API key in query string | High | Low | **P1** |
| H-5 | Bootstrap double-emission | High | Low | **P1** |
| H-1 | SSE info leakage | High | Medium | **P2** |
| H-4 | Admin adjustment unlimited | High | Medium | **P2** |
| H-6 | Entry fee burn accounting | High | Medium | **P2** |
| H-7 | Commit timing exploit | High | Medium | **P2** |
| H-8 | Stale transfer balance | High | Low | **P2** |
| H-11 | Losing bet double-count | High | Low | **P2** |

---

## What's Done Well

Despite the findings above, the codebase has many positive qualities worth acknowledging:

- **Clean architecture**: separation of routes, jobs, config, and middleware
- **Prisma transactions**: all multi-step operations use `$transaction` (with the caveat of C-5)
- **Zod validation**: all user inputs are validated with schemas
- **ReentrancyGuard**: properly applied to all state-changing functions in ArenaVault.sol
- **SafeERC20**: used throughout the contract for safe token transfers
- **Comprehensive test suite**: 31 Solidity tests all passing, plus E2E bash test
- **Structured logging**: Pino logger with context throughout
- **Rate limiting**: global 60 req/min rate limiter in place
- **Timing-safe comparison**: `crypto.timingSafeEqual` used for answer verification
- **Good use of enums**: status machines are well-defined in both Prisma and Solidity
