# THE FORGE — Full On-Chain Implementation Plan

## Architecture Summary

**Before:** DB is source of truth. Chain is fire-and-forget settlement layer. `wallet.balance` is an IOU.
**After:** Chain is source of truth for all token movements. DB is a read cache synced via contract events. Every token-touching operation is a confirmed on-chain tx before DB updates.

**ForgeToken:** Deployed separately via Doppler. Address provided as env var. We do NOT deploy this.
**Everything else:** Redeployed by us (ForgeArena v2, ArenaVault, VictoryEscrow, ForgeBonds). Clean slate, no migration.

---

## New Contract Interfaces (Solidity Build — Handed Off to Separate Agent)

### ForgeArena v2 — Changes from Current

Current `enterBout()` and `placeBet()` use `msg.sender` as participant. This blocks the backend relayer pattern. Add `*For()` functions:

```solidity
// NEW: Relay functions — onlyOwner, stores actual user address not msg.sender
function enterBoutFor(bytes32 boutId, address agent) external onlyOwner nonReentrant;
function placeBetFor(bytes32 boutId, address bettor, uint8 entrantIdx, uint256 amount) external onlyOwner nonReentrant;

// NEW: Claim relay — sends payout to VictoryEscrow instead of msg.sender
function resolveAndEscrow(bytes32 boutId, uint8[] calldata placements, address victoryEscrow) external onlyOwner nonReentrant;

// KEEP: Direct interaction for agents/users with wallets
function enterBout(bytes32 boutId) external nonReentrant;
function placeBet(bytes32 boutId, uint8 entrantIdx, uint256 amount) external nonReentrant;

// KEEP: All view functions, createBout, setBoutLive, cancelBout unchanged
```

**Token flow change:** After `resolveAndEscrow()`, winner payouts are sent to VictoryEscrow contract (not held in ForgeArena for pull-claiming). Rake is split: 50% to `arenaVault.depositYield()`, 50% to treasury. This connection already exists in the contract but was never called from the backend — now it fires on every resolution.

### VictoryEscrow (NEW Contract)

Receives winner payouts from ForgeArena. Gives winners a choice: instant claim (with burn tax) or create an OTC bond.

```solidity
contract VictoryEscrow is Ownable, ReentrancyGuard {
    ERC20Burnable public immutable forgeToken;
    address public forgeBonds;          // ForgeBonds contract address
    uint16 public instantBurnBps;       // 500 = 5%

    struct Escrow {
        address winner;
        uint256 amount;
        bytes32 boutId;
        bool claimed;
    }

    mapping(bytes32 => Escrow[]) public escrows;  // boutId => winner escrows

    // Called by ForgeArena after resolution
    function lockPayout(bytes32 boutId, address winner, uint256 amount) external;

    // Winner claims instant: burns 5%, receives 95%
    function claimInstant(bytes32 boutId, uint256 escrowIdx) external nonReentrant;

    // Winner creates OTC bond: transfers full amount to ForgeBonds
    function claimAsBond(bytes32 boutId, uint256 escrowIdx, uint16 discountBps, uint256 expiryTimestamp) external nonReentrant;

    // Relay versions for backend
    function claimInstantFor(bytes32 boutId, uint256 escrowIdx, address winner) external onlyOwner nonReentrant;
    function claimAsBondFor(bytes32 boutId, uint256 escrowIdx, address winner, uint16 discountBps, uint256 expiryTimestamp) external onlyOwner nonReentrant;

    // View
    function getEscrow(bytes32 boutId, uint256 escrowIdx) external view returns (Escrow memory);
    function getEscrowCount(bytes32 boutId) external view returns (uint256);
}
```

### ForgeBonds (NEW Contract)

On-chain OTC bond marketplace with lazy yield accrual.

```solidity
contract ForgeBonds is Ownable, ReentrancyGuard {
    ERC20Burnable public immutable forgeToken;
    uint256 public immutable launchTimestamp;

    // Bootstrap APR schedule — set once at deployment, immutable
    struct AprTier {
        uint32 dayStart;
        uint32 dayEnd;
        uint32 aprBps;    // basis points (2000% = 2_000_00 bps... or use raw: 200000)
    }
    AprTier[] public aprSchedule;
    uint32 public baseAprBps;  // post-bootstrap rate (500 = 5%)

    struct Bond {
        address creator;
        bytes32 boutId;
        uint256 faceValue;
        uint256 remainingValue;
        uint16 discountBps;        // e.g. 1000 = 10%
        uint32 aprBps;             // IMMUTABLE — snapshot at creation
        uint256 accruedYield;      // last-calculated accrued amount
        uint256 lastYieldAt;       // timestamp of last accrual calc
        uint256 expiresAt;
        bool expired;
    }

    mapping(uint256 => Bond) public bonds;
    uint256 public nextBondId;

    // --- Core Functions ---

    // Called by VictoryEscrow when winner chooses OTC_BOND path
    function createBond(
        address creator,
        bytes32 boutId,
        uint256 faceValue,
        uint16 discountBps,
        uint256 expiresAt
    ) external returns (uint256 bondId);

    // Buyer purchases bond (full or partial). Lazy-accrues yield first.
    function buyBond(uint256 bondId, uint256 amount) external nonReentrant;

    // Creator claims accrued yield. Lazy-accrues first.
    function claimYield(uint256 bondId) external nonReentrant;

    // Anyone can expire a bond past its expiry. Returns remaining + yield to creator.
    function expireBond(uint256 bondId) external nonReentrant;

    // --- Relay versions ---
    function buyBondFor(uint256 bondId, uint256 amount, address buyer) external onlyOwner nonReentrant;
    function claimYieldFor(uint256 bondId, address creator) external onlyOwner nonReentrant;

    // --- Internal ---

    // Lazy accrual: called before any state change on a bond
    function _accrueYield(uint256 bondId) internal;
    // Pure view: get current APR based on block.timestamp
    function getCurrentAprBps() public view returns (uint32);
    // Pure view: calculate yield for a bond without modifying state
    function pendingYield(uint256 bondId) external view returns (uint256);

    // --- View ---
    function getBond(uint256 bondId) external view returns (Bond memory);
    function getActiveBonds() external view returns (uint256[] memory);
}
```

**Lazy Yield Accrual — How It Works:**

```solidity
function _accrueYield(uint256 bondId) internal {
    Bond storage bond = bonds[bondId];
    if (bond.remainingValue == 0 || bond.expired) return;

    uint256 elapsed = block.timestamp - bond.lastYieldAt;
    if (elapsed == 0) return;

    // Cap elapsed at expiry
    if (block.timestamp > bond.expiresAt) {
        elapsed = bond.expiresAt - bond.lastYieldAt;
    }

    // yield = remainingValue * aprBps / 10000 * elapsed / 365 days
    // Using 1e18 precision to avoid truncation
    uint256 yield = (bond.remainingValue * bond.aprBps * elapsed) / (10000 * 365 days);

    bond.accruedYield += yield;
    bond.lastYieldAt = block.timestamp > bond.expiresAt ? bond.expiresAt : block.timestamp;
}
```

**Why this is NOT complex:**
- No cron needed. No keeper needed.
- `_accrueYield()` is called automatically inside `buyBond()`, `claimYield()`, `expireBond()`
- APR is immutable per bond (snapshot at creation from `getCurrentAprBps()`)
- `getCurrentAprBps()` reads `block.timestamp - launchTimestamp`, walks the schedule, returns the tier rate
- This is the exact same pattern as Compound/Aave interest accrual

**Why the current system was broken:**
- Cron overwrote `aprBps` every 6 hours (bond creator promised 2000%, silently got 5%)
- Accrual only happened every 6 hours (small bonds got floor()'d to 0)
- Yield came from nowhere (treasury ledger entry, no backing tokens)

**On-chain fix:**
- APR locked at creation — you get the rate you were promised
- Yield accrues continuously (calculated lazily at interaction time)
- Yield is funded from tokens held in the ForgeBonds contract (from face value + protocol allocation)

### Yield Funding Source

**Problem:** Where do yield tokens come from? The bond face value is what the buyer receives. Yield is extra.

**Solution:** The bootstrap schedule already has `boutInjection` amounts. These are treasury emissions. The backend (or a treasury manager contract) periodically calls `forgeBonds.fundYieldPool(amount)` to deposit FORGE that backs yield payments. Post-bootstrap, yield is funded from protocol rake (the 50% that goes to treasury).

Add to ForgeBonds:
```solidity
uint256 public yieldPool;  // tokens available to pay yield

function fundYieldPool(uint256 amount) external;  // anyone can fund

// In _accrueYield: yield is capped by yieldPool
// In claimYield: yieldPool -= claimedAmount
```

### ArenaVault — No Changes Needed

Already has `depositYield()`, `stake()`, `unstake()`, `claimYield()`. Just needs to be redeployed with new ForgeToken address and authorized depositors set correctly.

### Deployment Order

1. ForgeToken — deployed via Doppler (we get the address)
2. ArenaVault — constructor(forgeTokenAddress, ownerAddress)
3. VictoryEscrow — constructor(forgeTokenAddress, ownerAddress, instantBurnBps=500)
4. ForgeBonds — constructor(forgeTokenAddress, launchTimestamp, baseAprBps=500, aprSchedule[], ownerAddress)
5. ForgeArena v2 — constructor(forgeTokenAddress, arenaVaultAddress, treasuryAddress, ownerAddress)
6. Wire up:
   - `arenaVault.setDepositor(forgeArenaAddress, true)`
   - `victoryEscrow.setForgeBonds(forgeBondsAddress)`
   - `forgeArena.setVictoryEscrow(victoryEscrowAddress)`
   - Transfer FORGE to relevant contracts (vault seed, yield pool seed)
   - Approve spending between contracts

---

## Backend Implementation Plan

### Phase 1: Chain Service Rewrite (`src/chain.js` → `src/chain/`)

**Current state:** Single file with `sendTx()`, `settleBurn()`, `settleTransfer()`, fire-and-forget pattern.
**Target:** Chain-first service where every token operation is an awaited on-chain tx.

#### 1.1 — New chain module structure

```
src/chain/
  index.js          — provider, wallet, contract instances, exports
  arena.js          — ForgeArena interactions
  escrow.js         — VictoryEscrow interactions
  bonds.js          — ForgeBonds interactions
  vault.js          — ArenaVault interactions
  token.js          — ForgeToken read-only (balanceOf, totalSupply)
  events.js         — Event listener / indexer
  tx.js             — Transaction submission with retry, nonce management
```

#### 1.2 — `tx.js`: Transaction layer

Replace fire-and-forget with await-for-receipt:

```javascript
// Shared nonce-managed tx sender
// - Acquires lock (existing txLock pattern)
// - Submits tx
// - Waits for receipt (configurable confirmations, default 1)
// - Retries on transient RPC errors (3 attempts, exponential backoff)
// - Throws on revert (caller handles)
// - Returns receipt with parsed events

export async function submitTx(contractMethod, label) {
    await acquireTxLock();
    try {
        const tx = await contractMethod;
        const receipt = await tx.wait(1);  // 1 confirmation
        if (!receipt.status) throw new ChainRevertError(label, receipt);
        return receipt;
    } finally {
        releaseTxLock();
    }
}
```

#### 1.3 — `arena.js`: ForgeArena service

```javascript
export async function createBout(boutId, config) { /* ... */ }
export async function setBoutLive(boutId) { /* ... */ }
export async function enterBoutFor(boutId, agentAddress) { /* ... */ }
export async function placeBetFor(boutId, bettorAddress, entrantIdx, amount) { /* ... */ }
export async function resolveAndEscrow(boutId, placements, victoryEscrowAddress) { /* ... */ }
export async function cancelBout(boutId) { /* ... */ }
```

#### 1.4 — `escrow.js`: VictoryEscrow service

```javascript
export async function claimInstantFor(boutId, escrowIdx, winnerAddress) { /* ... */ }
export async function claimAsBondFor(boutId, escrowIdx, winnerAddress, discountBps, expiryTimestamp) { /* ... */ }
```

#### 1.5 — `bonds.js`: ForgeBonds service

```javascript
export async function buyBondFor(bondId, amount, buyerAddress) { /* ... */ }
export async function claimYieldFor(bondId, creatorAddress) { /* ... */ }
export async function expireBond(bondId) { /* ... */ }
export async function fundYieldPool(amount) { /* ... */ }
// Read-only
export async function getBond(bondId) { /* ... */ }
export async function pendingYield(bondId) { /* ... */ }
```

#### 1.6 — `vault.js`: ArenaVault service

```javascript
export async function depositYield(amount) { /* ... */ }
// Read-only
export async function getPosition(userAddress) { /* ... */ }
export async function totalStaked() { /* ... */ }
```

#### 1.7 — `events.js`: Event indexer

Listen for contract events and sync DB. This replaces the pattern of "hope DB matches chain":

```javascript
// On startup: subscribe to events from all contracts
// ForgeArena: BoutCreated, BoutEntered, BetPlaced, BoutResolved, PayoutClaimed, BoutCancelled
// VictoryEscrow: PayoutLocked, InstantClaimed, BondCreated
// ForgeBonds: BondListed, BondPurchased, YieldClaimed, BondExpired
// ArenaVault: Staked, Unstaked, YieldDeposited, YieldClaimed

// Each event handler updates DB to mirror chain state
// This is the ONLY path for DB writes on token-related data
```

**Critical pattern:** API endpoints submit chain tx → wait for receipt → parse events → update DB from events. The event handler is also used for catch-up sync on restart (query past events from last processed block).

#### 1.8 — Config changes (`src/config.js`)

```javascript
chain: {
    rpcUrl: process.env.BASE_RPC_URL,
    forgeTokenAddress: process.env.FORGE_TOKEN_ADDRESS,      // From Doppler deployment
    forgeArenaAddress: process.env.FORGE_ARENA_ADDRESS,      // Our deployment
    arenaVaultAddress: process.env.ARENA_VAULT_ADDRESS,      // Our deployment
    victoryEscrowAddress: process.env.VICTORY_ESCROW_ADDRESS, // Our deployment
    forgeBondsAddress: process.env.FORGE_BONDS_ADDRESS,      // Our deployment
    deployerAddress: process.env.DEPLOYER_ADDRESS,
    confirmations: 1,
    // ... existing bps configs stay
},
```

### Phase 2: Route Rewrites (Chain-First Pattern)

Every route that touches token balances follows this pattern:

```javascript
// BEFORE (DB-first, fire-and-forget chain)
await prisma.$transaction([
    prisma.wallet.update({ balance: { decrement: amount } }),
    prisma.transaction.create({ ... }),
]);
settleBurn(amount, 'BOUT_ENTRY', boutId);  // fire and forget

// AFTER (Chain-first, DB mirrors)
const receipt = await arena.enterBoutFor(boutId, wallet.address);  // await chain
const events = parseEvents(receipt);  // extract BoutEntered event
await prisma.$transaction([  // DB mirrors confirmed chain state
    prisma.boutEntrant.create({ ... }),
    prisma.transaction.create({ ... }),
]);
```

#### 2.1 — `POST /api/register` (`src/routes/wallet.js:22`)

**Current:** Creates wallet in DB with initialBalance, burns registrationBurn from DB balance.
**New:**
- Create wallet record in DB (name, apiKey, xHandle)
- `wallet.address` is NOW REQUIRED — registration must include an on-chain address
- `wallet.balance` is no longer set by us — it reflects `forgeToken.balanceOf(address)` on chain
- Registration burn: agent must have FORGE and approve the backend. Backend calls `forgeToken.burnFrom(agentAddress, registrationBurn)` on chain.
- If agent has no FORGE yet: registration is "pending" until they fund their wallet (x402, DEX, owner transfer) and the burn completes.

**Decision:** Split registration into two steps:
1. `POST /api/register` — creates DB record with address, returns apiKey. No chain interaction. Agent is `status: PENDING`.
2. `POST /api/activate` — agent has funded their wallet. Backend calls `forgeToken.burnFrom(address, registrationBurn)`. On success, agent is `status: ACTIVE`. All other endpoints require ACTIVE status.

OR: Skip the burn entirely for registration. The entry fees and bet burns handle deflation. This simplifies onboarding. **Recommend: skip registration burn, simplify to one step.**

#### 2.2 — `POST /api/bouts/:id/enter` (`src/routes/bouts.js:141`)

**Current:** DB deduction of entry fee + DB burn tracking.
**New:**
1. Validate eligibility (age, solves, status) — DB reads only
2. Check agent has approved ForgeArena for entryFee amount: `forgeToken.allowance(agentAddress, forgeArenaAddress)`
3. Call `arena.enterBoutFor(boutId, agentAddress)` — chain tx
4. Wait for receipt. Contract handles: transferFrom agent → arena, burn portion, store entrant
5. Parse `BoutEntered` event
6. Update DB: create BoutEntrant, Transaction record

**Agent responsibility:** Before calling this endpoint, agent must have:
- Sufficient FORGE balance (from x402, owner, DEX)
- Approved ForgeArena to spend their tokens (`forgeToken.approve(forgeArenaAddress, amount)`)

**Backend can help:** Add `POST /api/approve` endpoint that instructs agent on what to approve, or if agent uses API-only (no wallet), backend holds tokens and calls `enterBout` directly from deployer. But this reintroduces custodial model.

**Resolution:** Two modes:
- **Wallet mode** (agent has `address`): Agent approves contracts, backend calls `*For()` relay functions
- **Custodial mode** (API-key-only agents during transition): Backend holds FORGE, calls non-For functions directly. DB tracks internal balance. Phase out over time.

**Recommend: Wallet mode only.** Clean break. Every agent needs an address. x402 and owner funding solve the "how do I get FORGE" problem.

#### 2.3 — `POST /api/bouts/:id/bet` (`src/routes/bouts.js:261`)

**Current:** DB deduction of bet amount + DB burn tracking.
**New:**
1. Validate: bout is in BETTING phase, agent hasn't bet, amount within maxBetPercent
2. Check allowance: `forgeToken.allowance(bettorAddress, forgeArenaAddress) >= amount`
3. Call `arena.placeBetFor(boutId, bettorAddress, entrantIdx, amount)` — chain tx
4. Wait for receipt. Contract handles: transferFrom bettor → arena, burn portion, store bet
5. Parse `BetPlaced` event
6. Update DB: create Bet, Transaction record

#### 2.4 — Bout Resolution (`src/jobs/bout-scheduler.js`)

**Current:** Backend calculates all payouts in DB, calls `resolveBout([])` with empty placements.
**New:**
1. Backend determines placements (from commit-reveal answers, or judge scoring)
2. Call `arena.resolveAndEscrow(boutId, placements, victoryEscrowAddress)` — chain tx
3. Contract calculates payouts (agent purse split, bettor pool split) and transfers them to VictoryEscrow
4. Contract splits rake: 50% → `arenaVault.depositYield()`, 50% → treasury address
5. Parse `BoutResolved` event (includes all payout amounts)
6. Update DB: bout status, entrant placements, payout amounts, rake amounts

**Key change:** Payout calculation moves from backend JS to Solidity. The contract's `_setAgentPayouts` and `_setBettorPayouts` already do this. We just need the new `resolveAndEscrow` to route outputs to VictoryEscrow instead of holding them for pull-claiming.

#### 2.5 — `POST /api/bouts/:id/claim` (`src/routes/bouts.js:588`)

**Current:** DB credit + async burn (INSTANT) or DB bond creation (OTC_BOND).
**New — INSTANT path:**
1. Validate: caller is winner with unclaimed escrow
2. Call `escrow.claimInstantFor(boutId, escrowIdx, winnerAddress)` — chain tx
3. Contract burns 5%, transfers 95% to winner address
4. Parse `InstantClaimed` event
5. Update DB: entrant payoutChoice, burnTaxPaid, netPayout

**New — OTC_BOND path:**
1. Validate: caller is winner with unclaimed escrow
2. Calculate bond params: discountBps (from config), expiryTimestamp (now + 7 days)
3. Call `escrow.claimAsBondFor(boutId, escrowIdx, winnerAddress, discountBps, expiryTimestamp)` — chain tx
4. VictoryEscrow transfers tokens to ForgeBonds, ForgeBonds creates bond
5. Parse `BondCreated` event (includes bondId, aprBps snapshot, all terms)
6. Update DB: create VictoryBond record mirroring on-chain state

#### 2.6 — `POST /api/bonds/:id/buy` (`src/routes/bonds.js:144`)

**Current:** Pure DB balance transfers.
**New:**
1. Validate: bond is active, amount >= partialFillMin
2. Check buyer allowance: `forgeToken.allowance(buyerAddress, forgeBondsAddress) >= discountedPrice`
3. Call `bonds.buyBondFor(bondId, amount, buyerAddress)` — chain tx
4. Contract: lazy-accrues yield → transfers discounted price from buyer → credits creator yield → decrements remainingValue
5. Parse `BondPurchased` event
6. Update DB: BondFill record, update VictoryBond remainingValue/status

**Treasury fill during bootstrap:** The `treasuryFillDays` logic moves on-chain. ForgeBonds contract has a `treasuryFillPool` funded by backend. When a bond is purchased during bootstrap period, contract covers part of discount from this pool.

#### 2.7 — `POST /api/bonds/:id/claim-yield` (`src/routes/bonds.js:336`)

**Current:** DB credit of accruedYield.
**New:**
1. Call `bonds.claimYieldFor(bondId, creatorAddress)` — chain tx
2. Contract: lazy-accrues → transfers yield to creator → resets accrued to 0
3. Parse `YieldClaimed` event
4. Update DB: reset accruedYield, Transaction record

#### 2.8 — `POST /api/vault/stake` (`src/routes/vault.js:129`)

**Current:** DB-only stake tracking with separate on-chain bootstrap emission job.
**New:**
1. Check allowance: `forgeToken.allowance(userAddress, arenaVaultAddress) >= amount`
2. User calls `arenaVault.stake(amount, covenant)` directly (or backend relays)
3. Parse `Staked` event
4. Update DB: create StakePosition mirroring chain state

**Key:** Staking is already fully implemented on-chain in ArenaVault. The DB just needs to mirror it. The current backend re-implements all the staking math in JS — that goes away.

#### 2.9 — `POST /api/vault/unstake` (`src/routes/vault.js:226`)

**Current:** DB-only with JS-reimplemented rage quit math.
**New:**
1. User calls `arenaVault.unstake()` directly (or backend relays)
2. Contract handles: lock check, rage quit tax, vesting forfeiture, transfer remainder
3. Parse `Unstaked` event (includes returned, taxed, forfeited amounts)
4. Update DB: StakePosition inactive, Transaction records

#### 2.10 — `POST /api/transfer` (`src/routes/transfer.js:17`)

**Current:** DB balance transfer between wallets.
**New:**
1. This is just `forgeToken.transfer()` on chain
2. Sender calls it directly from their wallet
3. Backend can relay if needed: `forgeToken.transferFrom(sender, recipient, amount)` (requires sender approval)
4. Parse `Transfer` event
5. Update DB: Transaction record

**Or simply remove this endpoint.** Standard ERC-20 transfers don't need our API. Agents can transfer directly on-chain.

### Phase 3: Job Rewrites

#### 3.1 — `bond-yield.js` — DELETE

The cron-based yield accrual job is **eliminated entirely**. Yield is lazy-accrued on-chain in ForgeBonds contract. No backend involvement needed.

#### 3.2 — `bootstrap.js` — Simplify to Yield Pool Funding

**Current:** Distributes APY to stakers via DB, calls `depositYield()` on-chain.
**New:**
- Bootstrap emissions for stakers: still calls `arenaVault.depositYield(amount)` on schedule. ArenaVault already handles distribution. Keep this job but simplify — it only does the on-chain call, no DB balance updates.
- Bond yield pool funding: periodically calls `forgeBonds.fundYieldPool(amount)` to ensure bonds can pay yield. Amount comes from treasury allocation per bootstrap schedule.

#### 3.3 — `bout-scheduler.js` — Keep, Update Chain Calls

**Current:** Manages bout lifecycle, calls `createBout`/`setBoutLive`/`resolveBout` on chain.
**New:** Same lifecycle management, but:
- `createBout` → same (already on-chain)
- `setBoutLive` → same (already on-chain)
- Resolution phase → calls `resolveAndEscrow()` with real placements (not empty array)
- Remove all DB-only payout calculation. Payouts are calculated by the contract.

#### 3.4 — `settlement.js` — DELETE

The settlement retry queue (`SettlementTask` model) is eliminated. There's no fire-and-forget anymore. Every chain tx is awaited. If it fails, the API returns an error and the user retries.

#### 3.5 — `supply-invariant.js` — Simplify

**Current:** Complex check summing DB balances, stakes, escrows, bonds.
**New:**
```javascript
const onChainSupply = await forgeToken.totalSupply();
const expectedSupply = MAX_SUPPLY - totalBurned;  // from chain events
assert(onChainSupply === expectedSupply);
```

The invariant check becomes trivial because chain IS the source of truth. No DB-vs-chain reconciliation needed.

#### 3.6 — `expiry.js` — Keep for Puzzles, Add Bond Expiry Trigger

Puzzle expiry is unrelated to token flow (it's game logic), so keep it.

Add: periodically check for expired bonds and call `forgeBonds.expireBond(bondId)` on-chain. This is needed because on-chain contracts can't self-execute. Someone must call `expireBond()`. Backend does this as a public service (anyone could call it, but we ensure it happens).

### Phase 4: Schema Changes

#### 4.1 — Wallet Model

```diff
model Wallet {
  id         String   @id @default(uuid())
  apiKey     String   @unique @map("api_key")
  name       String   @unique
  xHandle    String?  @map("x_handle")
- address    String?  @map("address")
+ address    String   @map("address")  // REQUIRED — on-chain address
- balance    BigInt   @default(0)
- gas        BigInt   @default(0)
+ // balance is READ from chain: forgeToken.balanceOf(address)
+ // gas system removed — users pay real gas
+ status     String   @default("ACTIVE")  // ACTIVE | SUSPENDED
  reputation Int      @default(0)
  createdAt  DateTime @default(now()) @map("created_at")
  // ... relations unchanged
}
```

**`balance` removal:** The DB no longer tracks token balances. All balance reads go to `forgeToken.balanceOf(address)`. For performance, the event indexer can maintain a cache table, but it's never the source of truth.

**`gas` removal:** Users pay real Base L2 gas. No game-internal gas system.

#### 4.2 — Add Balance Cache (Optional, for API Performance)

```prisma
model BalanceCache {
  address    String   @id
  balance    BigInt   @default(0)
  lastBlock  BigInt   @default(0)
  updatedAt  DateTime @updatedAt
  @@map("balance_cache")
}
```

Updated by event indexer on every `Transfer`, `Burn` event. API reads from this for fast responses. Stale data is acceptable for display — actual operations check chain.

#### 4.3 — VictoryBond Model Updates

```diff
model VictoryBond {
  id String @id @default(uuid())
+ onChainBondId  BigInt?  @map("on_chain_bond_id")  // ForgeBonds contract ID
  // ... existing fields
- accruedYield BigInt   @default(0) @map("accrued_yield")
- lastYieldAt  DateTime @default(now()) @map("last_yield_at")
+ // yield is lazy-calculated on-chain, read via forgeBonds.pendingYield(bondId)
  // ... rest unchanged
}
```

#### 4.4 — Remove SettlementTask Model

```diff
- model SettlementTask { ... }
```

No more fire-and-forget settlement queue.

#### 4.5 — Remove TreasuryLedger `balance` Field

```diff
model TreasuryLedger {
  id        String   @id @default(uuid())
  action    String
  amount    BigInt
  memo      String?
- balance   BigInt   @default(0)  // was tracking running balance
+ txHash    String?  @map("tx_hash")  // on-chain tx reference
  createdAt DateTime @default(now()) @map("created_at")
}
```

Treasury balance is just `forgeToken.balanceOf(treasuryAddress)` on chain.

#### 4.6 — Add Event Sync Tracking

```prisma
model EventSyncCursor {
  contract    String   @id         // contract address
  lastBlock   BigInt   @default(0) @map("last_block")
  updatedAt   DateTime @updatedAt  @map("updated_at")
  @@map("event_sync_cursors")
}
```

Tracks last processed block per contract for event indexer catch-up on restart.

### Phase 5: Middleware & Auth Changes

#### 5.1 — Auth Middleware

**Current:** API-key based auth, attaches `req.wallet`.
**New:** Keep API-key auth for our API endpoints. But also verify that `req.wallet.address` exists. Add `req.wallet.address` to every chain call.

#### 5.2 — Remove Gas Middleware/Checks

All `gasCost*` config values and gas deduction logic in routes — remove entirely. Users pay Base L2 gas directly.

#### 5.3 — Add Chain Status Middleware

```javascript
// Reject token-touching requests if chain is unavailable
function requireChain(req, res, next) {
    if (!chainReady) return res.status(503).json({ error: 'Chain unavailable' });
    next();
}
```

### Phase 6: Frontend/SSE Changes

#### 6.1 — Balance Display

**Current:** Reads `wallet.balance` from DB.
**New:** Calls `forgeToken.balanceOf(address)` or reads from BalanceCache. Update all balance-displaying endpoints.

#### 6.2 — Bond Yield Display

**Current:** Reads `victoryBond.accruedYield` from DB.
**New:** Calls `forgeBonds.pendingYield(bondId)` on chain. Returns real-time accrued amount.

#### 6.3 — Vault Position Display

**Current:** Reads StakePosition from DB (with JS-calculated loyalty/vesting).
**New:** Calls `arenaVault.getPosition(address)` on chain. All math done by contract.

### Phase 7: Agent Onboarding (x402 / Owner Funding)

#### 7.1 — Registration Flow

```
1. Agent calls POST /api/register { name, xHandle, address }
2. Backend creates Wallet record, returns apiKey
3. Agent needs FORGE to participate:
   a. Owner sends FORGE to agent's address (standard ERC-20 transfer)
   b. Agent acquires FORGE via x402 payment
   c. Agent buys FORGE on a DEX
4. Agent approves contracts:
   - forgeToken.approve(forgeArenaAddress, MAX_UINT256)
   - forgeToken.approve(forgeBondsAddress, MAX_UINT256)
5. Agent is ready to enter bouts, place bets, buy bonds
```

#### 7.2 — Approval Helper Endpoint

```
GET /api/contracts
Returns: {
    forgeToken: "0x...",
    forgeArena: "0x...",
    arenaVault: "0x...",
    victoryEscrow: "0x...",
    forgeBonds: "0x...",
    chainId: 8453,
    requiredApprovals: [
        { spender: "0x...(ForgeArena)", description: "Bout entry and betting" },
        { spender: "0x...(ForgeBonds)", description: "Bond purchases" },
        { spender: "0x...(ArenaVault)", description: "Staking" },
    ]
}
```

Agents can use this to know what to approve.

---

## Files Changed Summary

### New Files
| File | Purpose |
|------|---------|
| `src/chain/index.js` | Provider, wallet, contract instances |
| `src/chain/tx.js` | Nonce-managed tx submission with retry |
| `src/chain/arena.js` | ForgeArena interactions |
| `src/chain/escrow.js` | VictoryEscrow interactions |
| `src/chain/bonds.js` | ForgeBonds interactions |
| `src/chain/vault.js` | ArenaVault interactions |
| `src/chain/token.js` | ForgeToken read-only queries |
| `src/chain/events.js` | Event listener / DB indexer |

### Modified Files
| File | Changes |
|------|---------|
| `src/routes/wallet.js` | Remove balance/gas fields, require address, add /contracts endpoint |
| `src/routes/bouts.js` | Chain-first entry, betting, claiming |
| `src/routes/bonds.js` | Chain-first buy, yield claim, remove DB-only logic |
| `src/routes/vault.js` | Delegate to on-chain ArenaVault, remove JS math |
| `src/routes/transfer.js` | Chain-first or remove entirely |
| `src/routes/admin.js` | Update stats to read from chain |
| `src/routes/leaderboard.js` | Remove balance sorting (or use cache) |
| `src/config.js` | Add new contract addresses, remove gas costs |
| `src/server.js` | Start event indexer, remove deleted jobs |
| `src/middleware/auth.js` | Require wallet.address, add requireChain |
| `prisma/schema.prisma` | Schema changes per Phase 4 |
| `src/jobs/bout-scheduler.js` | Use resolveAndEscrow with real placements |
| `src/jobs/bootstrap.js` | Simplify to on-chain depositYield + fundYieldPool only |
| `src/jobs/expiry.js` | Add bond expiry trigger |
| `src/jobs/supply-invariant.js` | Simplify to on-chain totalSupply check |

### Deleted Files
| File | Reason |
|------|--------|
| `src/chain.js` | Replaced by `src/chain/` module |
| `src/jobs/bond-yield.js` | Lazy accrual on-chain eliminates cron |
| `src/jobs/settlement.js` | No more fire-and-forget settlement queue |

---

## Implementation Order

**Step 1:** Schema migration (Phase 4) — clean slate, no migration concerns
**Step 2:** Chain service module (Phase 1) — tx.js first, then per-contract services
**Step 3:** Event indexer (Phase 1.7) — subscribe to events, sync DB
**Step 4:** Route rewrites (Phase 2) — one at a time, starting with registration → entry → betting → resolution → claiming → bonds
**Step 5:** Job rewrites (Phase 3) — delete bond-yield + settlement, update bout-scheduler + bootstrap
**Step 6:** Middleware + config (Phase 5) — gas removal, chain status, auth updates
**Step 7:** Read endpoints (Phase 6) — balance, vault, bond yield displays from chain

Each step is independently testable. Steps 1-3 are foundational. Steps 4-7 can be done route-by-route.

---

## Contract Interface Requirements (For Solidity Agent)

The Solidity agent needs to build:

1. **ForgeArena v2** — current ForgeArena + `enterBoutFor()`, `placeBetFor()`, `resolveAndEscrow()` relay functions
2. **VictoryEscrow** — lock payouts, claimInstant (5% burn), claimAsBond (route to ForgeBonds), relay versions
3. **ForgeBonds** — createBond, buyBond, claimYield, expireBond with lazy accrual, yieldPool funding, bootstrap APR schedule, relay versions

All three need:
- Standard OpenZeppelin (Ownable, ReentrancyGuard, SafeERC20)
- Events for every state change (backend indexes these)
- View functions for all state (backend reads these for API responses)
- `*For()` relay variants of user-facing functions (onlyOwner)
