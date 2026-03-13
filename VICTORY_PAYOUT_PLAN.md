# Victory Payout System — Implementation Plan

## Overview

Replace the current "win FORGE, sell FORGE" flow with a **three-path victory payout system** that gives winners flexibility while creating new demand sinks, reducing sell pressure, and rewarding patience.

---

## Path 1: Instant Withdrawal (5% Burn Tax)

**Summary**: Winner claims immediately; 5% of payout is burned permanently.

### Why it works
- Simple, familiar UX — "I won, I want my tokens now"
- 5% burn is meaningful enough to incentivize bonds while still being fair for impatient winners
- Every instant claim feeds the burn → benefits all holders

### Changes Required

#### 1. Database (Prisma Schema)
- Add `PayoutChoice` enum: `INSTANT | OTC_BOND | FURNACE_LP`
- Add fields to `BoutEntrant` model:
  ```
  payoutChoice     PayoutChoice?    // null until winner chooses
  payoutChosenAt   DateTime?
  burnTaxPaid      BigInt?          // 5% burn on instant
  netPayout        BigInt?          // payout - burnTax
  ```
- Add fields to `Bet` model (same pattern for bettor winners):
  ```
  payoutChoice     PayoutChoice?
  payoutChosenAt   DateTime?
  burnTaxPaid      BigInt?
  netPayout        BigInt?
  ```
- Add new `TransactionType`: `VICTORY_BURN_TAX`
- Add new `TreasuryLedger` action: `VICTORY_BURN`

#### 2. Config (`src/config.js`)
```js
victory: {
  instantBurnPercent: 5,       // 5% burn on instant withdrawal
}
```

#### 3. API Route (`src/routes/bouts.js`)
New endpoint: **`POST /api/bouts/:id/claim`**
```
Body: { choice: "INSTANT" }
Auth: API key (winner only)

Flow:
1. Verify bout is RESOLVED
2. Verify caller is a winner (agent with placement OR bettor with payout > 0)
3. Verify no prior choice made
4. Calculate: burnTax = payout * 0.05, netPayout = payout - burnTax
5. Credit netPayout to winner wallet
6. Record burn in TreasuryLedger (VICTORY_BURN)
7. Record Transaction (VICTORY_BURN_TAX)
8. Update supply invariant buckets
9. Return { netPayout, burnTax, choice: "INSTANT" }
```

#### 4. Bout Scheduler (`src/jobs/bout-scheduler.js`)
- Currently auto-credits winners on RESOLVED. **Change**: Do NOT auto-credit.
- Instead, set payout amounts but leave funds in escrow (bout-level holding)
- Add `payoutDeadlineDays` config (e.g., 7 days) — after which unclaimed payouts auto-INSTANT (with burn tax)

#### 5. Supply Invariant (`src/jobs/supply-invariant.js`)
- Add new bucket: `totalEscrowedPayouts` (unclaimed victory funds)
- Adjust invariant: `wallets + staked + unvested + vested + escrowed = minted - burned`

---

## Path 2: Victory OTC Bond

**Summary**: Winner locks their payout into a bond that earns staking-matching APR. The bond is sold OTC at a 10% discount to buyers. During bootstrap (first 2 weeks), treasury fills the 10% gap. After bootstrap, the 10% discount comes from the winner's principal (winner accepts the haircut for the APR benefit).

### Why it works
- **For the winner**: Earns yield on winnings instead of dumping. Patient winners get MORE than instant.
- **For the buyer**: Gets FORGE at 10% below spot — natural demand sink.
- **For the protocol**: Locks up supply, creates secondary market, reduces sell pressure.
- **During bootstrap**: Treasury subsidizes the discount → attracts early bond buyers and creates the habit.

### Design Details

**Bond Lifecycle**:
```
1. Winner creates bond (locks payout)
2. Bond accrues APR matching current staking APR (from ArenaVault)
3. Bond listed on OTC marketplace at 10% discount
4. Buyer purchases bond (pays 90% of face value in FORGE)
5. Winner receives: 90% from buyer + 10% from treasury (bootstrap) OR just 90% (post-bootstrap)
6. Buyer receives: full bond amount (face value) — effectively buying at discount
7. APR accrued goes to the bond HOLDER (initially winner, then buyer after sale)
8. Partial fills allowed — bond can be sold in chunks
```

**APR Matching Logic**:
- Query current effective staking APR from bootstrap schedule / vault yield rate
- Apply same APR to bond principal
- Yield accrues per-block (or per-6h matching bootstrap job cadence)
- Yield paid from treasury emissions (same pool as staker yield)

**Bootstrap Treasury Fill (first 14 days)**:
- Treasury covers the 10% discount gap
- Budget cap: configurable (e.g., 500K FORGE max for bootstrap bond fills)
- After cap or day 14: discount comes from winner's principal
- Tracked in TreasuryLedger as `BOND_DISCOUNT_FILL`

### Changes Required

#### 1. Database (Prisma Schema)

New model: **`VictoryBond`**
```prisma
model VictoryBond {
  id              String      @id @default(uuid())

  // Source
  boutId          String
  bout            Bout        @relation(fields: [boutId], references: [id])
  creatorId       String
  creator         Wallet      @relation("BondCreator", fields: [creatorId], references: [id])
  sourceType      String      // "AGENT_PURSE" | "BET_WIN"
  entrantId       String?     // if from agent placement
  betId           String?     // if from bet win

  // Bond terms
  faceValue       BigInt      // original payout amount
  remainingValue  BigInt      // unsold portion
  discountPercent Int         @default(10)   // 10%
  aprBps          Int         // basis points, mirrors staking APR at creation time

  // Yield tracking
  accruedYield    BigInt      @default(0)
  lastYieldAt     DateTime    @default(now())
  yieldClaimedBy  String?     // current holder

  // OTC state
  status          String      @default("ACTIVE")  // ACTIVE | FILLED | CANCELLED | EXPIRED
  treasuryFilled  Boolean     @default(false)      // did treasury cover the 10%?

  createdAt       DateTime    @default(now())
  filledAt        DateTime?
  expiresAt       DateTime?   // optional expiry

  // Relations
  fills           BondFill[]
}

model BondFill {
  id              String      @id @default(uuid())
  bondId          String
  bond            VictoryBond @relation(fields: [bondId], references: [id])
  buyerId         String
  buyer           Wallet      @relation(fields: [buyerId], references: [id])

  amount          BigInt      // face value portion purchased
  pricePaid       BigInt      // 90% of amount (the discounted price)
  discountAmount  BigInt      // 10% gap
  treasuryFill    BigInt      // portion treasury covered (bootstrap only)
  sellerReceived  BigInt      // what creator actually got

  createdAt       DateTime    @default(now())
}
```

#### 2. Config (`src/config.js`)
```js
victory: {
  instantBurnPercent: 5,
  bond: {
    discountPercent: 10,
    treasuryFillDays: 14,           // bootstrap: first 14 days
    treasuryFillBudget: 500000n,    // max FORGE treasury will spend on fills
    minBondSize: 100,               // min payout to create bond
    partialFillMin: 50,             // min purchase size
    expiryDays: 30,                 // bond expires after 30 days if unsold
    aprMatchSource: 'STAKING',      // match staking APR
  }
}
```

#### 3. API Routes — New file: `src/routes/bonds.js`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/bouts/:id/claim` | Winner | Choose payout path (INSTANT or OTC_BOND) |
| `GET` | `/api/bonds` | — | List active OTC bonds (marketplace) |
| `GET` | `/api/bonds/:id` | — | Bond detail + fills |
| `POST` | `/api/bonds/:id/buy` | Buyer | Purchase bond (full or partial) |
| `GET` | `/api/bonds/my` | Auth | My created/purchased bonds |

**`POST /api/bouts/:id/claim` with `{ choice: "OTC_BOND" }`**:
```
1. Verify bout RESOLVED, caller is winner, no prior choice
2. Snapshot current staking APR (from config/bootstrap schedule)
3. Create VictoryBond record
4. Move payout from escrow → bond escrow
5. Bond immediately visible on OTC marketplace
6. Return { bondId, faceValue, discountPercent, apr }
```

**`POST /api/bonds/:id/buy`**:
```
Body: { amount: 5000 }  // face value to purchase (optional, default = full remaining)

1. Verify bond ACTIVE, has remaining value
2. Calculate: pricePaid = amount * 0.90
3. Verify buyer has sufficient balance
4. Determine treasury fill:
   - If within bootstrap period (day ≤ 14) AND treasury budget remaining:
     treasuryFill = amount * 0.10
     sellerReceived = pricePaid + treasuryFill  (seller gets 100%)
   - Else:
     treasuryFill = 0
     sellerReceived = pricePaid  (seller accepts 90%)
5. Deduct pricePaid from buyer
6. Credit sellerReceived to bond creator
7. If treasuryFill > 0: deduct from treasury, log BOND_DISCOUNT_FILL
8. Transfer accrued yield to creator (they held the bond until now)
9. Update bond remainingValue
10. If remainingValue == 0: mark FILLED
11. Create BondFill record
12. Create Transactions for all movements
```

#### 4. Bond Yield Job — New file: `src/jobs/bond-yield.js`
```
Runs: Every 6 hours (alongside bootstrap job)

1. Fetch all ACTIVE bonds
2. For each bond:
   a. Calculate hours since lastYieldAt
   b. Compute yield: remainingValue * (aprBps / 10000) * (hours / 8760)
   c. Increment accruedYield
   d. Update lastYieldAt
3. Yield sits in bond until:
   - Bond is sold (yield goes to holder at time of sale)
   - Creator claims yield manually (new endpoint)
   - Bond expires (yield + remaining principal returned to creator)
```

#### 5. Supply Invariant Update
- New bucket: `totalBondEscrowed` (bond face values locked)
- New bucket: `totalBondYieldAccrued` (pending yield on bonds)

#### 6. Treasury Ledger Actions
- `BOND_DISCOUNT_FILL` — treasury covering 10% during bootstrap
- `BOND_YIELD` — yield paid to bond holders

---

## Path 3: Forge Furnace LP (Future — USDC Required)

**Summary**: Winner pairs their FORGE winnings with USDC from treasury to create an LP position. Winner earns LP fees + FORGE incentives.

### Why it works
- Deepens protocol-owned liquidity
- Winner gets productive asset instead of idle tokens
- USDC pairing creates real price floor

### Status: **DEFERRED** — Requires USDC in treasury (Phase 2)

### Placeholder Design
- Winner contributes FORGE, treasury matches with USDC (50/50)
- LP tokens held in protocol vault with yield sharing
- Winner can exit LP after lock period (7-30 days)
- LP fees split: 80% winner, 20% protocol
- Requires: Uniswap V3 or Aerodrome integration on Base

### Changes Required (Future)
- `PayoutChoice` enum already includes `FURNACE_LP` — no schema change needed later
- New smart contract: `ForgeFurnace.sol` (LP manager)
- New route: `src/routes/furnace.js`
- Treasury USDC tracking in ledger
- LP position NFT management (Uniswap V3)

**For now**: If user selects `FURNACE_LP`, return error: `"Forge Furnace LP coming soon — choose INSTANT or OTC_BOND"`

---

## Implementation Order

### Phase A: Foundation (Do First)
1. **Schema migration** — Add all new models, enums, fields
2. **Config updates** — Add `victory` section to config.js
3. **Escrow system** — Modify bout-scheduler to NOT auto-credit winners; hold in escrow
4. **Supply invariant** — Add escrowed payouts bucket

### Phase B: Instant Withdrawal
5. **Claim endpoint** — `POST /api/bouts/:id/claim` with `INSTANT` path
6. **Burn tax logic** — 5% burn + TreasuryLedger + Transaction records
7. **Auto-claim job** — After deadline (7 days), force-INSTANT unclaimed payouts
8. **Tests** — Unit tests for burn calculation, escrow flow

### Phase C: Victory OTC Bonds
9. **Bond creation** — Claim endpoint with `OTC_BOND` path
10. **Bond marketplace** — `GET /api/bonds` listing
11. **Bond purchase** — `POST /api/bonds/:id/buy` with partial fill support
12. **Treasury fill logic** — Bootstrap period detection + budget tracking
13. **Bond yield job** — `src/jobs/bond-yield.js` (6h cadence)
14. **Bond expiry** — Auto-return on expiry (30 days)
15. **Tests** — Bond lifecycle, partial fills, treasury fill caps

### Phase D: Documentation & Frontend
16. **Whitepaper update** — Add Victory Payout section to `docs/THE_FORGE_WHITEPAPER.md`
17. **Walkthrough update** — Add API docs to `docs/WALKTHROUGH.md`
18. **Frontend** — Victory claim modal, bond marketplace page (if frontend deployed)

### Phase E: Furnace LP (Deferred)
19. **Placeholder only** — Error message for FURNACE_LP choice
20. **Full implementation when USDC in treasury**

---

## Economic Impact Analysis

### Burn Acceleration
- Current burns: 10% entry fee + 2% bets + 50 FORGE registration
- **New burn**: +5% of all victory payouts claimed instantly
- Estimate: If 60% of winners choose instant → ~3% additional burn on total bout volume

### Supply Lock
- Victory bonds lock FORGE for days/weeks instead of instant dump
- During bootstrap: treasury spends ~10% of bond face values (capped at 500K FORGE)
- Post-bootstrap: Winners absorb the 10% discount themselves (still worth it for APR)

### Demand Generation
- OTC bonds at 10% discount = natural buy pressure from value seekers
- Bond APR matching staking = competitive alternative to direct staking
- Creates secondary market activity within the ecosystem

### Treasury Exposure
- Bootstrap bond fills (14 days): Max 500K FORGE (~0.125% of treasury allocation)
- Bond yield: Sourced from same emission pool as staker yield
- Net positive: Reduced sell pressure > treasury cost

---

## Key Decisions for Review

1. **Auto-claim deadline**: 7 days? Or let unclaimed payouts sit indefinitely?
2. **Bond expiry**: 30 days? Or no expiry (bond stays until sold)?
3. **Partial fills minimum**: 50 FORGE? Or percentage-based (e.g., min 10% of remaining)?
4. **Bond APR**: Snapshot at creation time (fixed)? Or floating (matches current staking APR)?
5. **Bootstrap fill budget**: 500K FORGE cap sufficient? Or percentage-based?
6. **Bond yield claim**: Can creator claim accrued yield while bond is still unsold? Or only on sale/expiry?
7. **Bettor winners**: Same three paths available to bettors? Or instant-only for bets?

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | MODIFY | Add PayoutChoice enum, VictoryBond + BondFill models, new fields on BoutEntrant/Bet |
| `src/config.js` | MODIFY | Add `victory` config section |
| `src/routes/bouts.js` | MODIFY | Add `POST /api/bouts/:id/claim` endpoint |
| `src/routes/bonds.js` | CREATE | New OTC bond marketplace routes |
| `src/server.js` | MODIFY | Mount bonds router |
| `src/jobs/bout-scheduler.js` | MODIFY | Change to escrow pattern (don't auto-credit) |
| `src/jobs/bond-yield.js` | CREATE | Bond APR accrual job |
| `src/jobs/supply-invariant.js` | MODIFY | Add escrowed + bond buckets |
| `src/bout-payout.js` | MODIFY | Minor — ensure payout calc returns escrow-ready amounts |
| `docs/THE_FORGE_WHITEPAPER.md` | MODIFY | Add Victory Payout System section |
| `docs/WALKTHROUGH.md` | MODIFY | Add bond API documentation |
| `contracts/src/ForgeArena.sol` | MODIFY (future) | On-chain escrow + bond if moving on-chain |
