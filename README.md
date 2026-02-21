# Vibesafe
Vibesafe is a webapp that runs security audits on codebases to write bespoke security audits to assess if the application is safe for production deployment. You can try it here: <LINK>

## Spec-Driven Development Guide
This repository uses **Spec-Driven Development (SDD)**, a multi-agent workflow developed by [Rei Nova](https://rei.gg/) where humans write intent, AI architects generate specifications, and orchestrators execute them with verification at every step.

## Quick Start

### 1. Create a Brief

```bash
cp docs/protocol/sdd/templates/brief-template.md docs/tasks/ongoing/my-feature/my-feature-brief.md
```

### 2. Fill in the Brief

```markdown
# My Feature Brief

**Author**: Your Name
**Date**: 2026-02-11
**Status**: Draft

## User Story

As a user,
I want to do X,
so that Y.

## Constraints

- MUST: Be idempotent
- MUST NOT: Break existing tests

## References

- docs/doctrine/architecture/db/database-doctrine.md
```

### 3. Generate a Spec

```
/architect @docs/tasks/ongoing/my-feature/my-feature-brief.md
```

The architect agent will:
- Read your brief
- Load relevant doctrines
- Ask clarifying questions (Socratic Q&A)
- Generate `my-feature-spec.md`

### 4. Execute the Spec

```bash
pnpm tsx scripts/orchestrate.ts docs/tasks/ongoing/my-feature/my-feature-spec.md
```

### 5. Review and Complete

After all phases pass, review the changes and move to completed:

```bash
mv docs/tasks/ongoing/my-feature docs/tasks/completed/
```

---

## System Architecture

### Actors

| Actor | Role | Tool |
|-------|------|------|
| **Human** | Writes briefs, reviews output | Editor |
| **Architect Agent** | Generates specs via Socratic Q&A | `/architect` |
| **Specialist Agents** | Domain experts (db, server, domain, frontend) | Spawned by architect |
| **Executor Agent** | Runs each step in spec | Claude Code CLI |
| **Orchestrator** | Parses spec, spawns executors, verifies | `scripts/orchestrate.ts` |

### Artifacts

```
Brief (human intent)
   │
   │  /architect
   ▼
Spec (machine-readable contract)
   │
   │  orchestrate.ts
   ▼
Code (verified output)
```

### State Machine

```
    ┌──────────┐
    │   IDEA   │
    └────┬─────┘
         │ human writes brief
         ▼
    ┌──────────┐
    │  BRIEF   │ ◄─────────────────────┐
    └────┬─────┘                       │
         │ /architect                  │ scope too large (decompose)
         ▼                             │
    ┌──────────┐                 ┌─────┴─────┐
    │   Q&A    │ ◄──────────────►│ DECOMPOSE │
    └────┬─────┘    clarify      └───────────┘
         │ confidence high             │
         ▼                             │ N sub-briefs
    ┌──────────┐ ◄─────────────────────┘
    │   SPEC   │
    └────┬─────┘
         │ pnpm tsx scripts/orchestrate.ts
         ▼
    ┌──────────┐      step fails  ┌──────────┐
    │ EXECUTING│ ────────────────►│  FAILED  │
    └────┬─────┘                  └────┬─────┘
         │                             │ fix & --from N.M
         │ ◄───────────────────────────┘
         │ all steps pass
         ▼
    ┌──────────┐
    │ COMPLETE │ ───► move to docs/tasks/completed/
    └──────────┘
```

---

## The Brief

A brief captures human intent in a structured format that the architect agent can process.

### Required Sections

| Section | Purpose |
|---------|---------|
| **User Story** | As a / I want / So that |
| **Constraints** | MUST / MUST NOT / SHOULD |
| **References** | Docs the architect should read |

### Optional Sections

| Section | Purpose |
|---------|---------|
| **Acceptance Criteria** | Binary pass/fail conditions |
| **Out of Scope** | Prevent scope creep |
| **Open Questions** | Trigger Socratic exploration |

### Template Location

```
docs/protocol/sdd/templates/brief-template.md
```

---

## The Spec

A spec is a machine-readable contract with a `Prompt Execution Strategy` section that the orchestrator parses and executes.

### Structure

```markdown
# Feature: Technical Specification

## 1. Overview
## 2. Scope
## 3. Architecture
## 4. Implementation
## 5. Error Handling
## 6. Testing Strategy
## 7. Failure Modes (FMEA)
## 8. Prompt Execution Strategy    ← Machine-readable section
## 9. Operational Queries
## 10. Spec Completeness Checklist
## 11. Change Log
```

### Execution Grammar

```markdown
### Phase 1: Domain Layer

#### Step 1.1: Create Entity

<prompt for Claude Code CLI>

##### Verify
- `pnpm app:compile`
- `pnpm test:unit:ci test/unit/domain/feature`

##### Timeout
120000

#### Gate
- `pnpm app:compile`
- `pnpm test:unit:ci`
```

### Template Location

```
docs/protocol/sdd/templates/spec-template.md
```

---

## Core Invariants

Every spec must satisfy these completeness requirements (from `_SPEC-STANDARD.md`):

### 1. Semantic Completeness

> Can an agent implement this without asking clarifying questions?

- All data structures fully defined (no `...`)
- All terms defined or linked
- All state machines exhaustive
- Nullability explicit on all columns

### 2. Verification Completeness

> Can an agent verify its own work without human judgment?

- Each phase has executable verification commands
- All invariants have audit queries
- Success criteria are binary (pass/fail)

### 3. Recovery Completeness

> Can an agent recover from a crash without data corruption?

- FMEA table with failure modes
- Idempotency guaranteed
- Rollback procedures defined

### 4. Context Completeness

> Can a fresh agent session execute this without prior conversation?

- Brief linked
- Decision rationale captured
- Change log present

### 5. Boundary Completeness

> Can an agent refuse out-of-scope requests?

- Scope table present
- Auth requirements explicit
- External dependencies listed

---

## Command Reference

### Architect Agent

```bash
# Generate spec from brief (in Claude Code)
/architect @docs/tasks/ongoing/<feature>/<feature>-brief.md
```

### Orchestrator

```bash
# Execute spec
pnpm tsx scripts/orchestrate.ts docs/tasks/ongoing/<feature>/<feature>-spec.md

# Preview execution plan (no changes)
pnpm tsx scripts/orchestrate.ts <spec> --dry-run

# Resume from specific step
pnpm tsx scripts/orchestrate.ts <spec> --from 2.3

# Stop on first error
pnpm tsx scripts/orchestrate.ts <spec> --fail-fast
```

### Development

```bash
pnpm app:dev          # Start dev server
pnpm app:compile      # Type check
pnpm app:lint         # Lint with auto-fix
pnpm test:unit:ci     # Unit tests
pnpm db:reset         # Reset database
pnpm db:test          # Database tests
```

---

## Troubleshooting

### "Architect keeps asking questions"

Your brief is ambiguous. Add more detail to:
- Constraints (be specific about MUST/MUST NOT)
- References (point to relevant doctrine files)
- Acceptance criteria (binary pass/fail)

### "Step failed verification"

1. Read the error message
2. Fix the issue manually or let the agent retry
3. Resume: `pnpm tsx scripts/orchestrate.ts <spec> --from N.M`

### "Spec is too large"

The architect should decompose automatically. If not:
- Break the brief into smaller user stories
- Each sub-brief gets its own spec
- Execute specs in dependency order

### "Wrong doctrine loaded"

Check the manifest at `docs/doctrine/doctrine-manifest.yaml`:
- Verify your feature's keywords match doctrine triggers
- Add missing triggers if needed

### "Orchestrator can't parse spec"

Verify the spec follows the grammar in `docs/protocol/sdd/execution-format.md`:
- Phase headers: `### Phase N: Name`
- Step headers: `#### Step N.M: Title`
- Verify blocks: `##### Verify` with backtick commands

---

## File Locations

| Purpose | Path |
|---------|------|
| **Protocol docs** | `docs/protocol/sdd/` |
| **Templates** | `docs/protocol/sdd/templates/` |
| **Active tasks** | `docs/tasks/ongoing/<feature>/` |
| **Completed tasks** | `docs/tasks/completed/<feature>/` |
| **Doctrines** | `docs/doctrine/architecture/` |
| **Doctrine manifest** | `docs/doctrine/doctrine-manifest.yaml` |

---

## Doctrine System

The architect agent uses a **doctrine manifest** to load relevant architectural guidance.

### How It Works

1. Architect reads `docs/doctrine/doctrine-manifest.yaml`
2. Scans brief for trigger keywords
3. Matches triggers → loads doctrine files
4. If 3+ doctrines match → spawns specialist agents

### Specialist Agents

| Agent | Doctrine | Triggers |
|-------|----------|----------|
| `db-architect` | database-doctrine.md | schema, RLS, RPC, migration |
| `server-architect` | server-doctrine.md | tRPC, router, edge function |
| `domain-architect` | domain-doctrine.md | entity, factory, Result |
| `frontend-architect` | frontend-doctrine.md | component, hook, repository |

### Adding New Doctrines

1. Create doctrine file in `docs/doctrine/architecture/<domain>/`
2. Add entry to `docs/doctrine/doctrine-manifest.yaml`
3. Define triggers, summary, and specialist agent

---

## Further Reading

| Document | Purpose |
|----------|---------|
| `docs/protocol/sdd/_SPEC-STANDARD.md` | Complete spec standards |
| `docs/protocol/sdd/brief-format.md` | Brief format specification |
| `docs/protocol/sdd/execution-format.md` | Execution grammar |
| `docs/doctrine/architecture/` | All architecture doctrines |
| `CLAUDE.md` | Agent-specific instructions |
