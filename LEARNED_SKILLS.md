# Learned: Claude Code Skills Patterns

**Source:** [levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills) (v3.3.0, 121 skills, 6 plugins)

This document captures key architecture patterns, skill design principles, and workflow automation strategies from the Claude Code Skills repository — a production-ready plugin suite for automating the full software development lifecycle.

---

## 1. Skill Architecture: Orchestrator-Worker Pattern (4 Levels)

The core pattern is a 4-level hierarchy where each level has single responsibility and loads only the context it needs:

| Level | Role | Example | Responsibility |
|-------|------|---------|---------------|
| **L0** | Meta-Orchestrator | ln-1000-pipeline-orchestrator | Coordinates via Agent Teams (TeamCreate), drives full pipeline |
| **L1** | Orchestrator | ln-400-story-executor | Manages lifecycle (Story → Done), delegates to workers |
| **L2** | Coordinator | ln-620-codebase-auditor | Coordinates parallel workers, aggregates results |
| **L3** | Worker | ln-621-security-auditor | Executes single focused task, returns structured output |

**Key principles:**
- Orchestrators load **metadata only**; workers load **full descriptions**
- Each skill has **single responsibility** — never combine orchestration with execution
- Workers are **context-isolated** via Agent tool subagents (fresh eyes review)
- Coordinators handle **plan/delegate/aggregate**; workers handle **execute/return**

### Orchestrator Lifecycle (Generic L2 Coordinator)

```
Phase 1: DISCOVERY → Load Team ID, project config, detect storage mode
Phase 2: PLAN → Articulate REAL GOAL, build IDEAL plan
Phase 3: MODE DETECTION → CREATE / REPLAN / ADD
Phase 4: DELEGATE → Send work to L3 workers
Phase 5: AGGREGATE → Collect and consolidate results
Phase 6: REPORT → Summary + next steps
```

---

## 2. Skill File Structure

Every skill follows this structure:

```
ln-{NNN}-{name}/
  SKILL.md          # Main skill definition (YAML frontmatter + workflow)
  references/       # Templates, guides, checklists (loaded via MANDATORY READ)
```

### SKILL.md Format

```markdown
---
name: ln-{NNN}-{name}
description: "Brief description (wrap in quotes if contains colons)"
license: MIT
---

> **Paths:** File paths are relative to skills repo root.

# Skill Name (Level Type)

## Purpose & Scope
## When to Use
## Workflow (phased)
## Critical Rules
## Definition of Done
## Reference Files

---
**Version:** X.Y.Z
**Last Updated:** YYYY-MM-DD
```

### File Reference Rule
- **MUST** use `**MANDATORY READ:** Load {file}` pattern for files agents need to read
- Passive references (`See`, `Per`, `Follows`) are NOT followed by agents
- Group multiple references into ONE `**MANDATORY READ:**` at section start

---

## 3. Task Delegation Pattern

Standard pattern for coordinators delegating to workers:

```javascript
Agent(
  description: "[Action] [item] via [skill-name]",
  prompt: "Execute worker.

Step 1: Invoke worker:
  Skill(skill: \"[skill-name]\")

CONTEXT:
[contextStore as JSON]",
  subagent_type: "general-purpose"
)
```

**Rules:**
- Pass minimum usable context (IDs or compact contextStore, not full reasoning trace)
- Use Agent tool when isolation matters (audits, reviews, parallel workers)
- Validate outputs explicitly — never assume worker success
- Choose one output mode per workflow: compact return OR file-based return

**Parallelism:** Independent workers run in parallel (multiple Agent calls in single message). Workers with data dependencies run sequentially.

**Anti-patterns:**
- Direct Skill tool without Agent wrapper (loses context isolation)
- Manual "Read skill from SKILL.md" in prompt (use Skill tool for framework-managed loading)
- Letting workers make routing decisions (keep workflow control in the coordinator)

---

## 4. Pipeline Workflow

The full development lifecycle follows this pipeline:

```
ln-700-project-bootstrap   →  CREATE or TRANSFORM project
         ↓
ln-100-documents-pipeline  →  Generate all documentation
         ↓
ln-200-scope-decomposer    →  Scope → Epics → Stories
         ↓
ln-1000-pipeline-orchestrator (or manually):
  ln-300-task-coordinator   →  Stories → Tasks
  ln-310-multi-agent-validator → Validate (GO/NO-GO)
  ln-400-story-executor     →  Execute tasks (impl → review → next)
  ln-500-story-quality-gate →  Quality gate (PASS/FAIL)
```

### Pipeline State Machine (ln-1000)
```
Backlog → Stage 0 (ln-300: create tasks) → Stage 1 (ln-310: validate)
  → Stage 2 (ln-400: implement) → Stage 3 (ln-500: quality gate)
  → Done (branch pushed) OR To Rework (max 2 cycles)
```

### Agent Teams Modes
- **teams**: Full Agent Teams (TeamCreate + heartbeat + SendMessage). Requires env var.
- **subagents**: Sequential Agent() spawns, results return directly. ~2x cheaper.

---

## 5. Goal Articulation Gate

Mandatory micro-step before execution/review/analysis. Forces explicit statement of the REAL goal to prevent surface-level reasoning failures. Based on the STAR framework — structured reasoning > context injection by 2.83x.

| # | Question | Guards Against |
|---|----------|---------------|
| 1 | **REAL GOAL:** What is the actual deliverable? (Name the primary subject) | Latching onto salient but wrong target |
| 2 | **DONE LOOKS LIKE:** What does success look like concretely? | Vague completion without measurable outcome |
| 3 | **NOT THE GOAL:** What would a shortcut produce? What would over-engineering produce? | Plausible but wrong answer; scope inflation |
| 4 | **INVARIANTS & HIDDEN CONSTRAINTS:** What implicit requirement isn't stated? | Knowing the constraint but ignoring it |

**Anti-Hallucination Rule:** If evidence for HIDDEN CONSTRAINTS is missing, write `UNKNOWN` and list assumptions explicitly. Do NOT invent constraints without a source anchor.

**Self-Check:** If REAL GOAL statement does not name the primary subject (the thing being changed/delivered), rewrite it. 100% of failures framed the goal around a secondary subject.

---

## 6. Task Hierarchy

Four decomposition levels:

| Level | Entity | Created By | Contains |
|-------|--------|-----------|----------|
| Scope | Project scope | User/ln-200 | Epics |
| Epic | Major feature | ln-210 | 3-7 Epics per scope |
| Story | User-facing value | ln-220 | Stories per Epic |
| Task | Atomic work unit | ln-300 | 1-6 tasks per Story |

**Prioritization:** RICE scoring (ln-230) with market research.

---

## 7. Quality & Review Patterns

### Multi-Model AI Review
Skills delegate reviews to external agents (Codex + Gemini) running in parallel, with Claude verification:
1. Parallel execution — both agents run simultaneously
2. Critical verification — Claude validates each suggestion (AGREE/DISAGREE/UNCERTAIN)
3. Debate protocol — challenge rounds (max 2) for controversial findings
4. Filtering — only high-confidence (>=90%), high-impact (>2%) suggestions surface
5. Fallback — self-review (Claude Opus) if agents unavailable

### Quality Gate (ln-500)
4-level verdict: PASS / CONCERNS / REWORK / FAIL
- Only ln-500 can mark a Story as Done
- Max 2 quality cycles (original + 1 rework)

### Code Review Loop
Execute → Review → Next (never skip review, never batch):
- ln-401 (execute) → ln-402 (review, inline) → ln-403 (rework if needed) → repeat

### Pre-Submission Checklist (ln-401)

| # | Check | What to Verify |
|---|-------|---------------|
| 0 | AC verified | Each AC `verify:` method executed with pass evidence |
| 1 | Approach alignment | Implementation matches Story Technical Approach |
| 2 | Clean code | No dead code, no backward-compat shims, unused imports removed |
| 3 | Config hygiene | No hardcoded creds/URLs/magic numbers |
| 4 | Docs updated | Affected Components docs reflect changes |
| 5 | Tests pass | Existing tests still pass after changes |
| 6 | Pattern reuse | New utilities checked against existing codebase; no duplicates |
| 7 | Architecture guard | Cascade depth <= 2 (leaf functions); no hidden writes in read-named functions |
| 8 | Destructive op safety | Backup, rollback, env guard, preview/dry-run |
| 9 | Code efficiency | No unnecessary intermediates, verbose patterns replaced by language idioms |

---

## 8. Risk-Based Testing

Replaces the traditional Test Pyramid (70/20/10 ratio) with a Value-Based Testing Framework.

### Core Philosophy
> "Write tests. Not too many. Mostly integration." — Kent Beck

### Risk Priority Matrix
```
Priority = Business Impact (1-5) x Probability of Failure (1-5)
  ≥15: MUST test (critical scenarios)
  9-14: SHOULD test if not covered
  ≤8: SKIP (manual testing sufficient)
```

### Minimum Viable Testing
- **Baseline (always):** E2E positive + negative per endpoint
- **Integration:** Add ONLY if E2E doesn't cover interaction AND Priority ≥15
- **Unit:** Add ONLY for complex OUR business logic with Priority ≥15

### Test Usefulness Criteria (ALL 6 must pass)

| # | Criterion | Question |
|---|-----------|----------|
| 1 | Risk Priority ≥15 | Business Impact × Probability ≥15? |
| 2 | Confidence ROI | Meaningful confidence relative to maintenance cost? |
| 3 | Behavioral | Tests observable behavior, not implementation details? |
| 4 | Predictive | Passing = confidence it works in production? |
| 5 | Specific | When test fails, cause is immediately obvious? |
| 6 | Non-Duplicative | Adds unique business value not covered by existing tests? |

### Anti-Patterns
- Testing framework code (Express, React, Prisma) — trust framework tests
- Duplicating E2E coverage with unit tests
- Aiming for 80% coverage instead of business risk
- Performance testing in Story tasks (belongs in DevOps Epic)
- Default Value Blindness — always test with non-default configuration values

---

## 9. AI-Ready Architecture

Based on "Sinks, Not Pipes" (Ian Bull, 2026): AI agents can't reason about side-effect chains >2 levels deep.

### Sinks vs Pipes

| Term | Definition | Cascade Depth |
|------|-----------|---------------|
| **Sink** | Completes work independently, no cascading side-effects | 0-1 (OK) |
| **Shallow Pipe** | Moderate chain, manageable | 2 (OK) |
| **Deep Pipe** | Cascading side-effects, AI cannot reason about full impact | 3+ (Refactor) |

### Flat Orchestration Pattern
```python
# Anti-pattern: cascading pipe
def process_payment(order):
    charge = payment_service.charge(order)  # internally calls invoice → notify → metrics

# Correct: flat orchestration (all steps visible)
def process_payment(order):
    charge = payment_service.charge(order)       # sink: charge only
    invoice = invoice_service.create(order)      # sink: create only
    notify_service.send(order, invoice)          # sink: notify only
    metrics_service.track("payment", order.id)   # sink: track only
```

### Architectural Honesty
Function interfaces must reveal all side-effects. A function named `get_*` that writes to DB is architecturally dishonest.

**Read-implying prefixes (must NOT write):** `get_`, `find_`, `check_`, `validate_`, `is_`, `has_`, `list_`, `count_`, `search_`, `fetch_`, `load_`, `read_`

**Write-implying prefixes (side-effects expected):** `create_`, `update_`, `delete_`, `save_`, `remove_`, `process_`, `handle_`, `execute_`, `send_`, `notify_`, `publish_`

### Architecture Guard (in ln-401 task executor)
1. 3+ side-effect categories in **leaf** function → split (orchestrator functions exempt)
2. `get_*/find_*/check_*` naming → verify no hidden writes
3. 3+ service imports in **leaf** function → flatten (orchestrator imports expected)

---

## 10. Destructive Operation Safety

When destructive operations detected (DROP, TRUNCATE, DELETE without WHERE, rm -rf, --force, etc.), ALL 5 measures must be documented:

| # | Measure | What to Document |
|---|---------|-----------------|
| 1 | Backup plan | What to backup, how to verify completeness |
| 2 | Rollback plan | Undo procedure, tested in non-production |
| 3 | Blast radius | Affected resources + scope + downtime |
| 4 | Environment guard | Gated by env check or admin confirmation |
| 5 | Preview / dry-run | What-if output, SQL diff, terraform plan |

**Severity:** CRITICAL (unguarded DELETE-all/DROP on user data) → HIGH (migration without DOWN, rm -rf variable path) → MEDIUM (cascade delete without scope docs)

**HITL Gate:** CRITICAL severity requires `AskUserQuestion` confirmation before proceeding.

---

## 11. Codebase Audit Suite (30+ Auditors)

Organized in 5 groups, all running in parallel:

| Group | Workers | What They Audit |
|-------|---------|----------------|
| **Documentation** | ln-611..614 | Structure, semantics, comments, fact-checking |
| **Codebase** | ln-621..629 | Security, build, DRY/KISS/YAGNI, quality, deps, dead code, observability, concurrency, lifecycle |
| **Testing** | ln-631..636 | Business logic, E2E coverage, value scoring, coverage gaps, isolation, manual tests |
| **Architecture** | ln-641..646 | Patterns, layer boundaries, API contracts, dependency graphs, OSS replacements, structure |
| **Persistence** | ln-651..654 | Query efficiency, transactions, runtime performance, resource lifecycle |

**Two-stage delegation:** Global workers (scan entire codebase) + Domain-aware workers (run per domain).

**Worker applicability gate:** Skip inapplicable workers based on project type (CLI tool, library, script, web service, worker/queue).

**Context validation post-filter:** ADR overrides, trivial DRY removal, cohesion checks, already-latest deps, single-consumer locality.

---

## 12. Optimization Suite

Three optimization coordinators:

| Coordinator | Workers | What They Optimize |
|-------------|---------|-------------------|
| **ln-810 Performance** | ln-811..813 | Algorithm autoresearch loop, query optimization, runtime optimization |
| **ln-820 Dependencies** | ln-821..823 | npm/yarn/pnpm, NuGet, pip/poetry upgrades |
| **ln-830 Modernization** | ln-831..832 | OSS replacement, bundle size reduction |

### Algorithm Optimizer Autoresearch Loop (ln-811)
Inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch):
```
benchmark → hypothesize → implement → benchmark → keep/discard
```
- Keep threshold: ≥10% improvement
- Simplicity criterion: marginal gain + ugly code = discard
- Crash triage + experiment log
- Test coverage gate ensures correctness before speed

---

## 13. Project Bootstrap (ln-700)

Two modes:
- **CREATE:** Generate production-ready project from empty directory
- **TRANSFORM:** Migrate existing prototype to Clean Architecture

Sequential delegation chain:
```
ln-820 (deps) → ln-720 (structure) → ln-730 (DevOps) → ln-740 (quality)
  → ln-750 (commands) → ln-760 (security) → ln-770 (crosscutting) → ln-780 (verify)
```

Auto-detects: frontend framework, backend framework, database, ORM, platform origin (Replit, StackBlitz, etc.)

---

## 14. Community Engagement Suite

| Skill | Purpose |
|-------|---------|
| **ln-910** | Analyze community health, consult strategy, delegate |
| **ln-911** | Triage issues/PRs/discussions |
| **ln-912** | Compose + publish GitHub Discussion announcements |
| **ln-913** | Launch RFC/debate/poll discussions |

---

## 15. Hooks (Automated Validation)

Three hook types for continuous quality:

| Hook | Trigger | Action |
|------|---------|--------|
| **secret-scanner** | PreToolUse (Bash) | Blocks commits containing secrets |
| **story-validator** | UserPromptSubmit | Validates Story before execution |
| **code-quality** | PostToolUse (Edit/Write) | Reports DRY/KISS/YAGNI violations |

---

## 16. Meta-Analysis Protocol

Universal post-completion protocol for all coordinators and orchestrators. Run as LAST step after all delegated work completes. Output to chat.

**5 Universal Dimensions:**
1. **Deliverable Quality** — Did output meet stated goal? Any critical gaps?
2. **Worker Effectiveness** — Status per worker (OK/Degraded/Failed), bottleneck identification
3. **Failure Points** — Errors, timeouts, crashes, retries, manual interventions
4. **Improvement Candidates** — Top 1-3 focus areas tied to THIS run's weaknesses (not generic)
5. **Assumption Audit** — Compare actual outcome against Goal Articulation Gate expectations

**Issue Suggestion Triggers (patterns across 3+ runs):**
- Worker consistently failed → check setup
- Acceptance rate < 30% → refine delegation prompt
- Same blind spot repeated → broaden scope
- Same improvement candidate repeated → create GitHub issue

---

## 17. Key Design Principles

### Token Efficiency
- Context7: max 3000 tokens per library
- Skills load only files they need (metadata vs full descriptions)
- Progressive disclosure: tables > lists > text
- Concise terms (30-40% token reduction)

### Writing Guidelines
| Priority | Format | Use For |
|----------|--------|---------|
| 1st | Tables + ASCII diagrams | Comparisons, criteria, decisions |
| 2nd | Lists (enumerations) | Short items |
| 3rd | Text (last resort) | Complex explanations |

### Code Comments
- 15-20% ratio
- Explain WHY, not WHAT
- NO historical notes, NO code examples in comments
- Task/ADR IDs allowed as spec references

### Code Efficiency Criterion (self-check before submission)

| # | Question | What to Look For |
|---|----------|-----------------|
| 1 | Unnecessary intermediates? | Variables used once after assignment, wrapper functions that only forward calls |
| 2 | Verbose pattern where idiom exists? | Manual loop where map/filter suffices, explicit null checks where optional chaining exists |
| 3 | Boilerplate the framework handles? | Manual serialization, explicit type conversions the compiler infers |

**Tiebreaker rule:** When two implementations are equally correct, readable, and maintainable — choose fewer lines/tokens. Never sacrifice readability for brevity.

### Research-to-Action Gate
Before turning external research into changes: "What specific defect in current output does this fix?" If no concrete defect, the research is informational, not actionable.

---

## 18. Configuration & Tool Integration

### Tool Configuration (docs/tools_config.md)
All skills read this at startup. Determines:
- Task provider: Linear (API) or File Mode (local markdown)
- Research chain: MCP servers (Context7, Ref) or WebSearch fallback
- Git strategy: worktree isolation, branch naming
- Agent Teams mode: teams (full) or subagents (cheaper)

### MCP Servers
| Server | Purpose | Fallback |
|--------|---------|----------|
| Context7 | Library docs, APIs | WebSearch |
| Ref | Standards, RFCs, best practices | WebSearch |
| Linear | Issue tracking (Agile) | File Mode (kanban_board.md) |
| hashline-edit | Hash-based file editing with integrity verification | Standard Read/Edit/Write |

### Plugin Structure
6 plugins (agile-workflow, documentation-pipeline, codebase-audit-suite, project-bootstrap, optimization-suite, community-engagement), each declaring its skills array. Installed individually or together via `/plugin add`.

---

## 19. Worktree Isolation Pattern

All execution happens in isolated git worktrees:

```
branch = feature/{story-id}-{slug}
worktree_dir = .worktrees/story-{id}
git worktree add -b {branch} {worktree_dir} origin/master
```

- Self-detection: if already on `feature/*`, skip worktree creation
- Branch finalization (commit, push, cleanup) owned by quality gate (ln-500)
- Uncommitted changes carried via patch file

---

## 20. Error Handling & Recovery

### Pipeline Recovery (ln-1000)
- State persisted to `.pipeline/state.json` after every stage
- Checkpoint files per story for crash recovery
- Agent resume via `Agent(resume: agentId)`
- Crash detection: 3-step protocol (flag → probe → respawn)
- Max retries: 2 quality cycles, 1 validation retry, 1 crash respawn
- Context loss after compression → follow CONTEXT RECOVERY PROTOCOL

### General Error Handling
```
IF worker returns error:
  1. Log error details
  2. Continue with other workers when safe
  3. Include partial results in final output
  4. Mark failed checks as skipped/error with reason
```

---

## 21. Research & Influences

Key papers and methodologies implemented in the skill architecture:

| Source | Key Insight |
|--------|------------|
| [STAR Framework](https://arxiv.org/abs/2602.21814) (2025) | Forced goal articulation: +85pp accuracy; structured reasoning > context injection 2.83x |
| [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) (Anthropic, 2024) | Orchestrator-Worker, prompt chaining, evaluator-optimizer patterns |
| [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) (Anthropic, 2025) | 90.2% perf improvement with specialized agents |
| [Sinks, Not Pipes](https://ianbull.com/posts/software-architecture) (2026) | AI agents can't reason about side-effect chains >2 levels deep |
| [Test Desiderata](https://testdesiderata.com/) (Kent Beck, 2019) | 12 properties of valuable tests — no numerical targets, only usefulness |
| [autoresearch](https://github.com/karpathy/autoresearch) (Karpathy, 2025) | Modify → benchmark → binary keep/discard; compound baselines |
| [Claude Code Picks](https://amplifying.ai/research/claude-code-picks) (2026) | Claude's tool preferences are learned maturity signals, not bias |
