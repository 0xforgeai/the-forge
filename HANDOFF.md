# The Forge — Agent Handoff
**Date:** March 10, 2026  
**Repo:** github.com/anthropicaeon/the-forge  
**Latest commit:** `e131748` on main (frontend scaffold)

---

## What's Live

| Component | Where | Status |
|-----------|-------|--------|
| Backend API | https://the-forge-production-45c4.up.railway.app | ✅ Running |
| PostgreSQL | Railway internal (auto-injected `DATABASE_URL`) | ✅ Connected |
| ForgeToken | `0xd6B46AC3A4aa34689c9a7dA211527c43e27b2551` | ✅ Verified |
| ArenaVault | `0x2c155449c1804Ca4a4D522eB6678a16c72B8e6Ff` | ✅ Verified |
| **Frontend** | `frontend/` — Vite+React SPA (not deployed yet) | ✅ Built & tested locally |

Deployer wallet: `0x64A4eA07B1caAC927FD2ecACd4d295db38049c39`  
Railway project: just-perception / service the-forge / env production

---

## Code Changes Made This Session

All changes committed and pushed to `main` in commit `e131748`.

### Frontend Scaffold (NEW — `frontend/` directory)

| File | Purpose |
|------|---------|
| `frontend/vite.config.js` | Vite config with dev proxy (`/api` → `localhost:3000`) |
| `frontend/src/index.css` | Full design system (1141 lines) ported from `public/styles.css` |
| `frontend/src/App.jsx` | React Router with 5 routes |
| `frontend/src/main.jsx` | Entry point |

**Components** (`frontend/src/components/`):

| File | Purpose |
|------|---------|
| `Nav.jsx` | Sticky nav with React Router NavLinks, forge logo, "LIVE ON BASE" badge |
| `Footer.jsx` | "THE FORGE v2.0 · Built on Base" |
| `MatrixRain.jsx` | Canvas-based green matrix rain background |
| `StatsBar.jsx` | Reusable horizontal stat grid |
| `BoutCard.jsx` | Bout status tags, pool info, entrant list with live odds |
| `Countdown.jsx` | Days/hours/min/sec countdown timer |

**Pages** (`frontend/src/pages/`):

| File | Purpose |
|------|---------|
| `Home.jsx` | Hero ("STAKE. BET. COMPETE."), flywheel cards, (3,3) payoff matrix, ignition schedule, how-it-works timeline, live stats bar |
| `Arena.jsx` | Countdown to next bout, bout cards grid from `GET /api/bouts`, leaderboard table, SSE live event feed |
| `Vault.jsx` | Vault stats from `GET /api/vault/info`, 4 covenant cards (Flame/Steel/Obsidian/Eternal), yield sources, loyalty multiplier schedule, rage quit tax table |
| `Leaderboard.jsx` | Full agent table from `GET /api/leaderboard` with search filter |
| `Dashboard.jsx` | API key auth (localStorage), agent profile card, vault position, transaction history |

**Hooks** (`frontend/src/hooks/`):

| File | Purpose |
|------|---------|
| `useApi.js` | Fetch wrapper, auto-injects `x-api-key` from localStorage |
| `useSSE.js` | EventSource hook for `/api/events`, filters heartbeats, auto-reconnects |

**Static assets**: Brand PNGs + 22 SVG icons copied to `frontend/public/`

### Other files committed
- `.gitignore` — added `frontend/dist`
- `FORGE_HANDOFF.docx` — original handoff doc
- `SYNTAX_AUDIT_REPORT.txt` — syntax audit
- `contracts/broadcast/` — deploy broadcast JSON

---

## Build Verification

- ✅ Clean Vite build: **53 modules**, 216KB JS, 14.7KB CSS, **zero warnings**
- ✅ All 5 pages render correctly in browser
- ✅ Matrix rain background, nav links, all sections, empty states work
- ✅ API calls gracefully handle backend offline (empty states)
- ✅ SSE hook connects to `/api/events` on Arena page

---

## Railway Env Vars (all set)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Auto-injected |
| `HMAC_SECRET` | 189b0096...ffeb1 (64-char hex) |
| `ADMIN_USER` | forgeadmin_bfd8cd02 |
| `ADMIN_PASS` | Dis8Lm3uUBaxzNBOj15X40nnyqFEZ6Dw |
| `CORS_ORIGINS` | https://theforge.gg |
| `BASE_RPC_URL` | Alchemy Base mainnet |
| `FORGE_TOKEN_ADDRESS` | 0xd6B4...2551 |
| `ARENA_VAULT_ADDRESS` | 0x2c15...e6Ff |
| `NODE_ENV` | production |
| `LOGTAIL_TOKEN` | ❌ Not set (optional) |
| `SENTRY_DSN` | ❌ Not set (optional) |

---

## Known Issues

> **WARNING**  
> **Loyalty multiplier inflation:** When `claimYield()` settles after loyalty multiplier growth, pending yield can exceed what was deposited. The accumulator weight grows with loyalty, but `depositYield` only deposited a fixed amount. Worth adding a `min(pending, vaultBalance)` cap in ArenaVault.sol.

> **NOTE**  
> **BigInt migration:** Schema changed 17 fields from Int → BigInt. Current production DB is fresh (seeded with 2 agents, no bouts).

---

## Prioritized Next Steps

### 1. Deploy Frontend (🔴 High)
The React SPA is built but not deployed. Options:
- **Vercel/Netlify** — point to `frontend/`, set build command `npm run build`, output `dist/`
- **Railway static site** — add a second service for the frontend
- **Replace `public/`** — build frontend, copy `dist/` into `public/`, serve from Express

When deploying, set API URL to the production backend:
```js
// vite.config.js — update proxy for production
// OR set VITE_API_BASE env var and update useApi.js
```

Add `https://theforge.gg` (or deployed URL) to `CORS_ORIGINS` in Railway.

### 2. wagmi Contract Integration (🔴 High)
The frontend has wagmi + viem installed but not wired up. Still needed:
- `frontend/src/config/wagmi.js` — wagmi config with Base chain + Alchemy RPC
- `frontend/src/config/contracts.js` — ABI fragments for ForgeToken and ArenaVault
- `frontend/src/hooks/useForgeContracts.js` — contract read hooks (balanceOf, totalSupply, stakeInfo)
- Connect wallet button in Nav component
- On-chain stake/unstake/claimYield on Vault page

Contract addresses:
- ForgeToken: `0xd6B46AC3A4aa34689c9a7dA211527c43e27b2551`
- ArenaVault: `0x2c155449c1804Ca4a4D522eB6678a16c72B8e6Ff`

### 3. Seed Production Data (🟡 Medium)
- Create initial puzzles and bouts via `/admin` endpoints
- Register 3-5 AI agents via the SDK (`sdk/` directory)
- The admin credentials are set in Railway env vars

### 4. Liquidity (🟡 Medium)
- Deploy $FORGE liquidity pool on Aerodrome or Uniswap (Base)
- Deployer holds 600M $FORGE (60% of supply)

### 5. Config (🟢 Low)
- Custom domain: point `theforge.gg` → Railway/Vercel
- Sentry/Logtail: sign up, set env vars
- Mobile hamburger menu for nav (currently hidden on mobile)

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/server.js` | Express app entry, mounts all routes + cron jobs |
| `src/routes/bouts.js` | Core game logic: create, enter, commit, reveal, payout |
| `src/routes/wallet.js` | Agent registration, balance queries |
| `src/routes/vault.js` | Arena Vault staking: stake, unstake, info, me |
| `src/routes/admin.js` | Admin CRUD (basic auth protected) |
| `src/jobs/bout-scheduler.js` | Automated bout lifecycle + payouts |
| `src/jobs/bootstrap.js` | Emission schedule cron |
| `src/sse.js` | Real-time SSE manager |
| `prisma/schema.prisma` | Full data model (Wallet, Puzzle, Bout, Bet, StakePosition, Transaction) |
| `contracts/src/ArenaVault.sol` | Staking + yield (373 lines) |
| `contracts/src/ForgeToken.sol` | ERC-20 token |
| `railway.toml` | Deploy config (Nixpacks + Prisma push) |
| **`frontend/src/App.jsx`** | React SPA router (5 pages) |
| **`frontend/src/index.css`** | Complete design system (all tokens + components) |
| **`frontend/src/hooks/useApi.js`** | API client with key injection |
| **`frontend/src/hooks/useSSE.js`** | Real-time event stream hook |

---

## Useful Commands

```bash
# Run backend locally
npm run dev

# Run frontend locally (proxies /api → :3000)
cd frontend && npm run dev

# Build frontend for production
cd frontend && npx vite build

# Run Foundry tests
cd contracts && forge test -vv

# Deploy to Railway
railway up --service the-forge --detach

# Check Railway vars
railway variables --service the-forge

# Query contracts
cast call 0xd6B46AC3A4aa34689c9a7dA211527c43e27b2551 "totalSupply()(uint256)" --rpc-url "https://base-mainnet.g.alchemy.com/v2/NQ6flEGFoCYhNQTT7FL3K"
```
