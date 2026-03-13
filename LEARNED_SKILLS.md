# Learned: Claude Code Skills Patterns

**Source:** [levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills) (v3.2.0, 114 skills)

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

---

## 5. Task Hierarchy

Four decomposition levels:

| Level | Entity | Created By | Contains |
|-------|--------|-----------|----------|
| Scope | Project scope | User/ln-200 | Epics |
| Epic | Major feature | ln-210 | 3-7 Epics per scope |
| Story | User-facing value | ln-220 | Stories per Epic |
| Task | Atomic work unit | ln-300 | 1-6 tasks per Story |

**Prioritization:** RICE scoring (ln-230) with market research.

---

## 6. Quality & Review Patterns

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

---

## 7. Codebase Audit Suite (30+ Auditors)

Organized in 5 groups, all running in parallel:

| Group | Workers | What They Audit |
|-------|---------|----------------|
| **Documentation** | ln-611..614 | Structure, semantics, comments, fact-checking |
| **Codebase** | ln-621..629 | Security, build, DRY/KISS/YAGNI, quality, deps, dead code, observability, concurrency, lifecycle |
| **Testing** | ln-631..635 | Business logic, E2E coverage, value scoring, coverage gaps, isolation |
| **Architecture** | ln-641..646 | Patterns, layer boundaries, API contracts, dependency graphs, OSS replacements, structure |
| **Persistence** | ln-651..654 | Query efficiency, transactions, runtime performance, resource lifecycle |

**Two-stage delegation:** Global workers (scan entire codebase) + Domain-aware workers (run per domain).

**Context validation post-filter:** ADR overrides, trivial DRY removal, cohesion checks, already-latest deps, single-consumer locality.

---

## 8. Project Bootstrap (ln-700)

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

## 9. Hooks (Automated Validation)

Three hook types for continuous quality:

| Hook | Trigger | Action |
|------|---------|--------|
| **secret-scanner** | PreToolUse (Bash) | Blocks commits containing secrets |
| **story-validator** | UserPromptSubmit | Validates Story before execution |
| **code-quality** | PostToolUse (Edit/Write) | Reports DRY/KISS/YAGNI violations |

---

## 10. Key Design Principles

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

### Research-to-Action Gate
Before turning external research into changes: "What specific defect in current output does this fix?" If no concrete defect, the research is informational, not actionable.

---

## 11. Configuration & Tool Integration

### Tool Configuration (docs/tools_config.md)
All skills read this at startup. Determines:
- Task provider: Linear (API) or File Mode (local markdown)
- Research chain: MCP servers (Context7, Ref) or WebSearch fallback
- Git strategy: worktree isolation, branch naming

### MCP Servers
| Server | Purpose | Fallback |
|--------|---------|----------|
| Context7 | Library docs, APIs | WebSearch |
| Ref | Standards, RFCs, best practices | WebSearch |
| Linear | Issue tracking (Agile) | File Mode (kanban_board.md) |
| hashline-edit | Hash-based file editing | Standard Read/Edit/Write |

### Plugin Structure (.claude-plugin/marketplace.json)
5 plugins, each declaring its skills array. Skills are directories with SKILL.md. Plugins can be installed individually or all together via `/plugin add`.

---

## 12. Worktree Isolation Pattern

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

## 13. Error Handling & Recovery

### Pipeline Recovery (ln-1000)
- State persisted to `.pipeline/state.json` after every stage
- Checkpoint files per story for crash recovery
- Agent resume via `Agent(resume: agentId)`
- Crash detection: 3-step protocol (flag → probe → respawn)
- Max retries: 2 quality cycles, 1 validation retry, 1 crash respawn

### General Error Handling
```
IF worker returns error:
  1. Log error details
  2. Continue with other workers when safe
  3. Include partial results in final output
  4. Mark failed checks as skipped/error with reason
```
