# Spec Execution Format

**Authority**: Binding
**Version**: 1.0.0
**Date**: 2026-02-07
**Parent Spec**: docs/specs/_spec-standards.md

---

## 1. Purpose

This document defines the grammar for the **Prompt Execution Strategy** section of specifications. This section enables autonomous execution by orchestrators (human, agent, or script).

A spec without this section is a design document. A spec with this section is an executable contract.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Phase/Step/Verify grammar | Spec content standards (see `_spec-standards.md`) |
| Timeout specification | Brief format (see `brief-format.md`) |
| Gate definitions | Orchestrator implementation |
| Parsing rules | Agent tool permissions |

---

## 3. Section Header

The execution section MUST be titled with one of:

```markdown
## N. Prompting Strategy
## N. Prompt Execution Strategy
```

Where `N` is the section number in the document.

---

## 4. Grammar

### 4.1 Phase

```markdown
### Phase N: <Name>
```

- `N` is a 1-indexed integer
- `<Name>` is a human-readable phase title
- Phases execute sequentially

**Example:**
```markdown
### Phase 1: Schema Migration
### Phase 2: Domain Layer
### Phase 3: Integration Tests
```

### 4.2 Step

```markdown
#### Step N.M: <Title>

<Prompt content>
```

- `N` matches the parent phase number
- `M` is a 1-indexed step within the phase
- `<Title>` is a human-readable step title
- `<Prompt content>` is everything between the step header and the next section

**Example:**
```markdown
#### Step 1.1: Create Migration File

Read docs/specs/markets/scoring-subsystem-spec.md Section 3.

Create the migration file at supabase/migrations/YYYYMMDDHHMMSS_add_scoring_tables.sql.

Include all tables from Section 3.1 with exact column definitions.

Tools to use: Write
Tools to NOT use: Edit (file doesn't exist)
```

### 4.3 Verify Block

```markdown
##### Verify

- `<command>`
- `<command>`
```

- MUST appear after step content
- Each command is a backtick-wrapped shell command
- Commands execute sequentially; first failure stops verification
- All commands must exit 0 for step to pass

**Example:**
```markdown
##### Verify

- `pnpm app:compile`
- `pnpm test:unit:ci test/unit/domain/scoring.test.ts`
```

### 4.4 Timeout Block

```markdown
##### Timeout

<milliseconds>
```

- Optional; defaults to 180000 (3 minutes)
- Specifies maximum time for the step (not including verification)

**Example:**
```markdown
##### Timeout

300000
```

### 4.5 Phase Gate

```markdown
#### Gate

- `<command>`
- `<command>`
```

- Optional; runs after all steps in phase complete
- Same format as Verify block
- Failure blocks progression to next phase

**Example:**
```markdown
### Phase 1: Schema Migration

#### Step 1.1: Create Migration
...

#### Step 1.2: Apply Migration
...

#### Gate

- `pnpm app:compile`
- `pnpm db:test`
```

---

## 5. Complete Example

```markdown
## 8. Prompt Execution Strategy

### Phase 1: Database Schema

#### Step 1.1: Create Migration

Read docs/specs/markets/scoring-subsystem-spec.md Section 3.1.

Create migration file with all table definitions.

##### Verify

- `pnpm app:compile`

##### Timeout

120000

#### Step 1.2: Apply Migration

Run the migration against local Supabase.

##### Verify

- `pnpm db:reset`
- `pnpm db:test`

#### Gate

- `pnpm app:compile`
- `pnpm db:test`

### Phase 2: Domain Layer

#### Step 2.1: Create Entity

Read docs/specs/markets/scoring-subsystem-spec.md Section 4.

Create src/domain/scoring/ScoringRunEntity.ts.

##### Verify

- `pnpm app:compile`
- `pnpm test:unit:ci test/unit/domain/scoring`
```

---

## 6. Parsing Rules

For orchestrator implementers:

| Rule | Regex Pattern |
|------|---------------|
| Phase header | `^### Phase (\d+): (.+)$` |
| Step header | `^#### Step (\d+\.\d+): (.+)$` |
| Verify section | `^##### Verify$` followed by `- \`([^\`]+)\`` lines |
| Timeout section | `^##### Timeout$` followed by `^\s*(\d+)` |
| Gate section | `^#### Gate$` followed by `- \`([^\`]+)\`` lines |
| Prompt content | Everything between step header and next `####`/`#####` |

**Important:** Commands inside fenced code blocks (` ``` `) are NOT parsed as verify/gate commands. Only top-level markdown list items with backticks are parsed.

---

## 7. Execution Modes

This format supports multiple executors:

| Executor | Description |
|----------|-------------|
| Human + Claude (HIL) | Human pastes prompts, watches, intervenes |
| Claude self-orchestrating | Single session, Claude reads spec and executes sequentially |
| Orchestrator script | Automated spawning of Claude CLI per step |
| Parallel agents | Multiple Claudes on non-dependent phases (future) |

The format is executor-agnostic. The same spec works with any execution mode.

---

## 8. Verification Requirements

Every step SHOULD have a Verify block. Steps without verification:
- Cannot guarantee correctness
- Cannot be automatically retried on failure
- Require human judgment to proceed

Minimum verification for any code change:
```markdown
##### Verify

- `pnpm app:compile`
```

---

## 9. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-07 | Initial execution format specification |
