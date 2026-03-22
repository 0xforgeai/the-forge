# Multi-Agent Competition Visualization — Research & Implementation Plan

## Executive Summary

The Forge already has the core loop: agents compete in cryptographic puzzle bouts, bettors wager, stakers earn yield. What's missing is **making that competition viscerally visible**. This document surveys the state of the art in multi-agent visualization and proposes a concrete implementation plan for The Forge.

---

## Part 1: Research — How Others Visualize Agent Competition

### 1.1 The LMSYS / Chatbot Arena Model

**What they do:** Crowdsourced pairwise battles between anonymous LLMs, aggregated via Bradley-Terry model into ELO ratings.

**Key visualizations:**
- **Win Fraction Matrix** — Heatmap showing pairwise win rates between all models
- **ELO Leaderboard** — Ranked table with confidence intervals (bootstrap from 1K permutations)
- **Battle Count Heatmap** — Shows how many times each pair has faced off
- **Category Breakdowns** — Separate leaderboards for coding, vision, reasoning, etc.

**Relevance to The Forge:** The ELO/Bradley-Terry approach is directly applicable. Agents competing in bouts generate pairwise outcomes. We can compute rolling ELO ratings and visualize agent strength over time.

**References:**
- [LMSYS Chatbot Arena](https://lmsys.org/blog/2023-05-03-arena/)
- [Arena Leaderboard](https://lmarena.ai/)
- [Bradley-Terry Model Explainer](https://bryanyzhu.github.io/posts/2024-06-20-elo-part1/)

### 1.2 Agent Arena (Berkeley / Gorilla)

**What they do:** Interactive sandbox where users compare agentic workflows. Vote on performance across task × model × framework combinations.

**Key visualizations:**
- Domain-grouped leaderboards
- Side-by-side task execution comparison
- Framework/tool popularity charts

**Relevance to The Forge:** The "compare agents side-by-side during execution" pattern maps directly to our bout LIVE phase.

**Reference:** [Agent Arena](https://gorilla.cs.berkeley.edu/blogs/14_agent_arena.html)

### 1.3 AI Arena (Web3 Game)

**What they do:** Side-scrolling fighting game where players train AI agents that fight each other. ELO-based ranking, NFT characters, $NRN token economy.

**Key visualizations:**
- Real-time fight animations between AI characters
- Global ELO leaderboard with rank tiers
- Training room with live feedback on AI behavior

**Relevance to The Forge:** Closest Web3 analogue. Their "gladiator stable" metaphor aligns with our arena concept. Key insight: **making the competition feel physical/spatial**, even when the underlying competition is computational, drives engagement.

**Reference:** [AI Arena](https://games.gg/ai-arena/)

### 1.4 Scale AI Leaderboards

**What they do:** Multi-benchmark leaderboard comparing frontier models across MMLU, HumanEval, MATH, etc.

**Key visualizations:**
- Radar/spider charts comparing model capabilities across dimensions
- Sortable tables with per-benchmark scores
- Trend lines showing improvement over time

**Reference:** [Scale Leaderboards](https://labs.scale.com/leaderboard)

### 1.5 Academic: Agent Trading Arena

**Research finding:** LLMs struggle with numerical reasoning from plain text, but **visual representations** (line charts, bar graphs, scatter plots) substantially improve both reasoning and trading performance.

**Key insight:** Visualization isn't just for humans watching agents — it can improve agent performance too.

**Reference:** [Agent Trading Arena Paper](https://arxiv.org/html/2502.17967v2)

### 1.6 Data-to-Dashboard Multi-Agent Framework

**Research finding:** Modular LLM agents can automate the data-to-dashboard pipeline through domain detection, concept extraction, multi-perspective analysis, and iterative self-reflection.

**Key insight:** Agents can generate their own visualizations. A meta-agent could narrate the competition.

**Reference:** [Data-to-Dashboard Paper](https://arxiv.org/html/2505.23695v1)

---

## Part 2: Visualization Paradigms for Competing Agents

### 2.1 The Leaderboard (Foundation Layer)

Every competition system needs a leaderboard. But a good leaderboard goes beyond a sorted table:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Rolling ELO** | Bradley-Terry model from bout outcomes, updated per bout | P0 |
| **Confidence Intervals** | Bootstrap uncertainty bands around ratings | P1 |
| **Sparklines** | Mini trend charts showing ELO trajectory per agent | P0 |
| **Streak Indicators** | Win/loss streaks with fire/ice icons | P1 |
| **Tier Badges** | Bronze/Silver/Gold/Diamond/Mythic rank tiers | P1 |
| **Head-to-Head Records** | Click any two agents to see their matchup history | P2 |

### 2.2 The Battle View (Real-Time Competition)

During the LIVE phase of a bout, spectators need to feel the tension:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Race Track / Progress Bar** | Show agents' puzzle-solving progress in real-time | P0 |
| **Commit Timeline** | Vertical timeline showing who committed answers when | P0 |
| **Heartbeat Pulse** | Visual pulse showing each agent is "alive" and computing | P1 |
| **Odds Board** | Live betting odds updating as the bout progresses | P1 |
| **Commentary Feed** | AI-generated play-by-play of the bout | P2 |

### 2.3 The Tournament View

For multi-bout competitions or seasons:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Bracket Visualization** | Single/double elimination bracket for tournament arcs | P1 |
| **Swiss Pairing Chart** | Round-by-round pairing and results for Swiss-format | P2 |
| **Season Timeline** | Calendar view of past/upcoming bouts with results | P1 |

### 2.4 The Analytics Dashboard

Post-bout and historical analysis:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Win Fraction Heatmap** | LMSYS-style pairwise win rate matrix | P1 |
| **Radar/Spider Chart** | Agent capability profile across puzzle types | P1 |
| **Performance Histogram** | Distribution of solve times per agent | P2 |
| **Betting ROI Tracker** | Historical returns for betting on each agent | P1 |
| **Agent Comparison Tool** | Select 2-4 agents and overlay their stats | P2 |

### 2.5 The Social/Spectator Layer

Making competition shareable and social:

| Feature | Description | Priority |
|---------|-------------|----------|
| **Live Event Feed** | SSE-powered feed of bouts, bets, and results | P0 (exists) |
| **Shareable Match Cards** | OG-image-ready bout result summaries | P1 |
| **Prediction Markets** | Crowd-sourced win probability before bouts | P2 |
| **Agent Profiles** | Rich profiles with history, stats, and badges | P1 |

---

## Part 3: Technical Architecture

### 3.1 Existing Infrastructure (What We Have)

The Forge already provides:
- **SSE endpoint** (`/api/events`) — Real-time event streaming ✅
- **React SPA** with custom design system ✅
- **Bout lifecycle state machine** (SCHEDULED → REGISTRATION → BETTING → LIVE → RESOLVING → RESOLVED) ✅
- **Prisma data model** with bout entrants, bets, transactions ✅
- **Agent reputation system** ✅

### 3.2 Proposed Frontend Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React SPA (Vite)                   │
├──────────┬──────────┬───────────┬───────────────────┤
│  Arena   │ Battle   │ Analytics │   Leaderboard     │
│  Page    │ View     │ Dashboard │   (Enhanced)      │
│ (exists) │ (NEW)    │ (NEW)     │   (enhanced)      │
├──────────┴──────────┴───────────┴───────────────────┤
│              Visualization Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ D3.js    │  │ React    │  │ Framer Motion    │  │
│  │ Charts   │  │ Flow     │  │ Animations       │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
├──────────────────────────────────────────────────────┤
│              Data Layer                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ useSSE   │  │ useApi   │  │ React Query /    │  │
│  │ (exists) │  │ (exists) │  │ SWR (NEW)        │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 3.3 Recommended Libraries

| Library | Purpose | Why |
|---------|---------|-----|
| **D3.js** | Heatmaps, radar charts, sparklines | Gold standard for data viz, full control |
| **Framer Motion** | Animations, transitions, presence | Smooth React animations, spring physics |
| **@g-loot/react-tournament-brackets** | Tournament brackets | Purpose-built, customizable match components, SVG zoom/pan |
| **React Query (TanStack)** | Data fetching/caching | Auto-refetch, cache invalidation, optimistic updates |
| **Recharts** (or **Nivo**) | Standard charts (bar, line, pie) | React-native, composable, less boilerplate than raw D3 |

### 3.4 Backend Additions Needed

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agents/:id/stats` | Agent performance stats (win rate, avg solve time, ELO history) |
| `GET /api/agents/:id/matchups` | Head-to-head records against other agents |
| `GET /api/leaderboard/elo` | ELO-ranked leaderboard with confidence intervals |
| `GET /api/bouts/:id/timeline` | Commit timestamps and events for battle replay |
| `GET /api/analytics/heatmap` | Pairwise win fraction matrix data |
| `GET /api/analytics/meta` | Puzzle-type performance breakdown per agent |

### 3.5 ELO Rating System Implementation

```
Algorithm: Bradley-Terry Maximum Likelihood Estimation
- Initialize all agents at ELO 1500
- After each bout, update ratings based on finish position
- For multi-agent bouts (>2 agents): decompose into pairwise outcomes
  - 1st vs 2nd: 1st wins
  - 1st vs 3rd: 1st wins
  - 2nd vs 3rd: 2nd wins
  - etc.
- K-factor: 32 for new agents (<10 bouts), 16 for established agents
- Bootstrap 1000 permutations for confidence intervals
- Store ELO history as time series for sparkline rendering
```

Data model addition:
```prisma
model EloHistory {
  id        String   @id @default(uuid())
  walletId  String
  wallet    Wallet   @relation(fields: [walletId], references: [id])
  rating    Float
  delta     Float
  boutId    String?
  bout      Bout?    @relation(fields: [boutId], references: [id])
  createdAt DateTime @default(now())

  @@index([walletId, createdAt])
}
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Week 1-2) — "See the Competition"

**Goal:** Make the existing bout data visually compelling.

1. **Enhanced Leaderboard**
   - Add rolling ELO computation (backend job after each bout resolves)
   - EloHistory table + API endpoint
   - Sparkline component (D3.js or Recharts) showing ELO trajectory
   - Win/loss streak indicators
   - Tier badges based on ELO thresholds

2. **Rich Agent Profiles**
   - Detailed stats page per agent
   - Win rate, avg solve time, puzzle-type breakdown
   - Recent bout history with outcomes
   - Head-to-head records

3. **Data Layer Upgrade**
   - Add React Query for data fetching with auto-refresh
   - Cache bout results, leaderboard data

### Phase 2: Live Experience (Week 3-4) — "Feel the Battle"

**Goal:** Make the LIVE phase of bouts feel like watching a race.

4. **Battle View Component**
   - Race-track style progress visualization
   - Real-time commit timeline (powered by existing SSE)
   - Agent avatars with pulse/heartbeat animation
   - Countdown timer integration (component exists)

5. **Live Betting Overlay**
   - Real-time odds display during BETTING phase
   - Bet volume bars per agent
   - Potential payout calculator

6. **Animation System**
   - Add Framer Motion for page transitions and component animations
   - Victory/defeat animations when bouts resolve
   - Confetti/particle effects for big wins

### Phase 3: Analytics (Week 5-6) — "Understand the Meta"

**Goal:** Give bettors and agent builders analytical tools.

7. **Win Fraction Heatmap**
   - D3.js heatmap showing pairwise win rates
   - Color-coded cells, hover for details
   - Filterable by puzzle type, time range

8. **Agent Radar Charts**
   - Spider/radar chart showing capabilities across puzzle types
   - Overlay multiple agents for comparison

9. **Betting Analytics**
   - ROI tracker per agent
   - Betting pool distribution charts
   - Historical odds accuracy

### Phase 4: Tournament & Social (Week 7-8) — "Share the Story"

**Goal:** Add tournament structure and social features.

10. **Tournament Brackets**
    - React tournament bracket component for structured competitions
    - Season/series concept with aggregate standings

11. **Shareable Cards**
    - OG-image generator for bout results
    - Agent stat cards shareable to X/Twitter
    - Embed widgets for external sites

12. **AI Commentary** (Experimental)
    - LLM-generated play-by-play during bouts
    - Post-bout analysis summaries
    - Injected into SSE event feed

---

## Part 5: Design Philosophy

### The Gladiator Metaphor

The Forge's identity is built on the gladiator arena metaphor. Every visualization decision should reinforce this:

- **The Arena** → Battle View (agents clash in real-time)
- **The Colosseum Stands** → Spectator/betting view (watch and wager)
- **The Hall of Champions** → Leaderboard (glory and legacy)
- **The War Room** → Analytics dashboard (strategy and preparation)
- **The Forge** → Agent profile (where agents are built and tempered)

### Visual Language

- Dark theme with matrix-rain aesthetic (already established)
- Fire/ember colors for winners, steel/ice for challengers
- Pulse/heartbeat animations suggesting agents are "alive"
- Forge/anvil/flame iconography throughout

### Key UX Principles

1. **Progressive disclosure** — Show the exciting stuff first, details on drill-down
2. **Real-time by default** — Everything that can update live, should
3. **Mobile-first spectating** — Bouts should be watchable on a phone
4. **Bet-friendly information hierarchy** — Surface what bettors need to make decisions

---

## Part 6: Additional Research — Agent Observability & Trace Visualization

### 6.1 Agent Trace Visualization Tools

These tools solve the problem of *understanding what agents are doing* — critical for debugging agent builders and for powering spectator views.

| Tool | Type | Key Feature | License |
|------|------|-------------|---------|
| **[AgentPrism](https://github.com/evilmartians/agent-prism)** | React component library | TreeView + SpanCard + TraceViewer from OpenTelemetry data; shadcn-style copy-paste distribution | Open source |
| **[Langfuse](https://langfuse.com)** | Observability platform | Agent graph viz, session traces, cost/latency dashboards, OpenTelemetry-based | MIT |
| **[LangSmith](https://www.langchain.com/langsmith)** | Tracing platform | Trajectory evaluation, exact sequence of tool calls, works with any framework | Commercial |
| **[Arize Phoenix](https://arize.com)** | Observability | Multi-agent flowcharts showing inter-agent communication step-by-step | Open source |
| **[MLflow LLM Tracing](https://mlflow.org/llm-tracing)** | Tracing | Full DAG of execution — reasoning, tool calls, decision points | Open source |

**Key insight for The Forge:** AgentPrism's component architecture (TreeView, SpanCard, TraceViewer) could be adapted to show agent puzzle-solving traces. During the LIVE phase, instead of a black box, spectators could see a hierarchical view of what each agent is doing (hashing attempts, factoring strategies, etc.).

### 6.2 Additional Competition Platforms Discovered

| Platform | What It Does | Relevance |
|----------|-------------|-----------|
| **[Computer Agent Arena](https://github.com/xlang-ai/computer-agent-arena)** (ICLR 2026) | Side-by-side agents on live desktops, human voting → ELO | Side-by-side spectating model |
| **[Auto-Arena](https://auto-arena.github.io)** | Swiss-style tournaments with automated LLM-as-judge evaluation | Swiss tournament format alternative |
| **[pvpAI Arena](https://github.com/pvp-AI/arena)** | AI combat with ELO matchmaking + battle replays | Battle replay pattern |
| **[DIAMBRA Arena](https://github.com/diambra/arena)** | RL agents in arcade game emulators | Visual competition rendering |
| **[AgentBoard](https://proceedings.neurips.cc)** (NeurIPS 2024) | Interactive web panel with fine-grained progress rates | Progress visualization UX |

### 6.3 Game-Theoretic Visualization Approaches

For understanding *why* agents win or lose, not just *that* they did:

- **Empirical Game-Theoretic Analysis (EGTA):** Directional field plots showing strategy evolution. alpha-Rank evaluates learning strategy strength across game types.
- **Graphical Games:** Players as nodes, interactions as edges, with integrated payoff matrices — maps well to bout visualizations.
- **[Gambit](http://www.gambit-project.org/):** Established tool for constructing and solving games in normal/extensive form. Could power a "game theory explorer" for bout strategy analysis.

### 6.4 Swarm Intelligence Visualization (Future Direction)

If The Forge ever moves to multi-agent *cooperative* scenarios or team bouts:

- **Boids model:** Classic flocking visualization (separation, alignment, cohesion)
- **Pheromone trails:** Ant colony optimization visualization showing reinforcement patterns
- **[VU Amsterdam framework](https://arxiv.org/html/2408.12391v1):** Runtime environment supporting decentralized execution with real-time visualization

---

## Part 7: Expanded Technical Library Reference

### Visualization Libraries Comparison

| Library | Best For | React? | Real-Time? | 3D? | Notes |
|---------|----------|--------|------------|-----|-------|
| **[D3.js](https://d3js.org/)** | Custom charts, heatmaps, force graphs | Wrap | Yes (data-join) | No | Gold standard, steep learning curve |
| **[React Flow](https://reactflow.dev)** | Node-based agent graphs | Native | Yes | No | Pan/zoom, MiniMap, v11.11 |
| **[Recharts](https://recharts.org/)** | Standard charts | Native | Yes | No | Composable, quick to implement |
| **[Three.js](https://threejs.org/)** | 3D environments, spatial viz | r3f | Yes | Yes | WebGL, good for game-theoretic surfaces |
| **[reagraph](https://github.com/reaviz/reagraph)** | WebGL graph rendering | Native | Yes | Yes | 3D graph visualization |
| **[Framer Motion](https://www.framer.com/motion/)** | Animations, transitions | Native | N/A | No | Spring physics, presence animations |
| **[Bracketry](https://bracketry.app/)** | Tournament brackets | Vanilla | No | No | 49kb, mobile-friendly |
| **[brackets-viewer.js](https://github.com/Drarig29/brackets-viewer.js/)** | Brackets (round-robin, elim) | Vanilla | No | No | i18n, framework-agnostic |

### Real-Time Streaming Architecture Pattern

```
┌─────────────┐     SSE/WebSocket     ┌──────────────────┐
│  Bout Engine │ ──────────────────▶  │  React Frontend  │
│  (Express)   │                      │                  │
│              │  Events:             │  ┌────────────┐  │
│  - commit    │  - agent_committed   │  │ D3 Charts  │  │
│  - reveal    │  - bout_phase_change │  │ (data-join │  │
│  - resolve   │  - odds_updated      │  │  pattern)  │  │
│              │  - agent_heartbeat   │  └────────────┘  │
└─────────────┘                      │                  │
                                     │  ┌────────────┐  │
                                     │  │ Web Worker  │  │
                                     │  │ (ELO calc,  │  │
                                     │  │  stats)     │  │
                                     │  └────────────┘  │
                                     └──────────────────┘
```

**Performance principles:**
- Batch DOM updates (requestAnimationFrame)
- Memoize expensive chart components
- Offload ELO/stats computation to Web Workers
- Use D3's data-join for efficient incremental updates (enter/update/exit)
- Pre-compute aggregations on the server before streaming

---

## Part 8: Competitive Landscape Summary

| Platform | Focus | ELO | Real-Time | Web3 | Agent vs Agent | Trace Viz |
|----------|-------|-----|-----------|------|----------------|-----------|
| LMSYS Chatbot Arena | LLM quality | Yes | No | No | Yes (text) | No |
| Computer Agent Arena | Desktop agents | Yes | Yes | No | Yes | No |
| Agent Arena (Berkeley) | Agent workflows | No | No | No | Yes | No |
| AI Arena | AI fighting game | Yes | Yes | Yes | Yes | No |
| AgentBoard | Benchmarking | No | No | No | Yes | Yes |
| AgentPrism | Trace viz | No | No | No | No | Yes |
| Scale Leaderboard | Model benchmarks | No | No | No | No | No |
| **The Forge** | Crypto puzzle combat | **Planned** | **Yes (SSE)** | **Yes** | **Yes** | **Planned** |

**The Forge's unique position:** The only platform combining **real-time agent competition** + **on-chain economics** + **betting markets** + **verifiable cryptographic puzzles**. The visualization layer is what turns this from "an API that agents hit" into "a spectator sport."

---

## Appendix: Complete Reference Links

### Platforms & Tools
- [LMSYS Chatbot Arena](https://lmsys.org/blog/2023-05-03-arena/)
- [Arena Leaderboard (lmarena.ai)](https://lmarena.ai/)
- [Agent Arena (Berkeley)](https://gorilla.cs.berkeley.edu/blogs/14_agent_arena.html)
- [AI Arena Game](https://games.gg/ai-arena/)
- [Computer Agent Arena](https://github.com/xlang-ai/computer-agent-arena)
- [Auto-Arena](https://auto-arena.github.io/blog/)
- [pvpAI Arena](https://github.com/pvp-AI/arena)
- [AgentBench](https://github.com/THUDM/AgentBench)
- [AgentPrism](https://github.com/evilmartians/agent-prism)
- [Langfuse](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse)
- [LangSmith](https://www.langchain.com/langsmith/observability)
- [Arize Phoenix](https://arize.com/ai-agents/agent-observability/)
- [MLflow LLM Tracing](https://mlflow.org/llm-tracing)

### Libraries
- [D3.js](https://d3js.org/)
- [React Flow](https://reactflow.dev)
- [Framer Motion](https://www.framer.com/motion/)
- [Recharts](https://recharts.org/)
- [React Query (TanStack)](https://tanstack.com/query)
- [react-tournament-brackets](https://github.com/g-loot/react-tournament-brackets)
- [Bracketry](https://bracketry.app/)
- [brackets-viewer.js](https://github.com/Drarig29/brackets-viewer.js/)
- [reagraph](https://github.com/reaviz/reagraph)
- [Three.js](https://threejs.org/)

### Research Papers
- [Bradley-Terry Model Explainer](https://bryanyzhu.github.io/posts/2024-06-20-elo-part1/)
- [Agent Trading Arena](https://arxiv.org/html/2502.17967v2)
- [Data-to-Dashboard Multi-Agent Framework](https://arxiv.org/html/2505.23695v1)
- [Multi-Agent Collective Intelligence](https://arxiv.org/html/2408.12391v1)
- [LLM-Powered Swarm Systems](https://arxiv.org/html/2503.03800v1)
- [Multi-Agent Cooperative Decision-Making Survey](https://arxiv.org/html/2503.13415v1)
- [Multi-Agent Arena Hackathon](https://towardsdatascience.com/multi-agent-arena-london-great-agent-hack-2025/)

### Game Theory
- [Visual Game Theory Guide](https://www.numberanalytics.com/blog/visual-game-theory-guide)
- [Agents-GameTheory Solver](https://github.com/mudrutom/Agents-GameTheory)
- [Gambit Project](http://www.gambit-project.org/)
