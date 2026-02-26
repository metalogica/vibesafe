# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Vibesafe?

Vibesafe is a webapp that runs AI-powered security audits on codebases. Users paste a public GitHub repo URL, the system ingests source code, runs it through a MinMax AI security analysis agent, and produces a safety probability score with detailed vulnerability findings in a real-time activity feed.

## Pre-Implementation Checklist

Before writing any code, MUST:
1. Read relevant doctrine files
2. Read the protocol for current feature
3. Confirm schema matches protocol
4. List unknowns and ask if not covered

## Commands

```bash
pnpm app:dev              # Start Next.js dev server
pnpm app:build            # Production build
pnpm app:compile          # TypeScript type check (also runs as pre-commit hook)
pnpm app:lint             # ESLint
pnpm test:unit            # Unit tests (watch mode)
pnpm test:unit:ci         # Unit tests with coverage (CI)
```

Run a single test file:
```bash
pnpm vitest test/unit/path/to/file.test.ts --config vitest.config.unit.ts
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19
- **Language:** TypeScript 5 (strict mode)
- **Styling:** Tailwind CSS 4, dark mode only
- **Validation:** Zod 4
- **Database (planned):** Convex (serverless, real-time)
- **Testing:** Vitest 4 with jsdom, globals enabled (no imports needed for `describe`/`it`/`expect`)
- **Package manager:** pnpm

## Architecture

### Directory Layout

- `app/` — Next.js App Router pages and layouts
- `src/domain/` — Domain logic and types
- `src/frontend/` — React components
- `src/server/` — Server-side logic and services
- `test/unit/` — Unit tests (mirror `src/` structure)
- `scripts/orchestrator/` — SDD orchestrator (excluded from main tsconfig)
- `docs/doctrine/` — Binding architectural standards (loaded by architect agent via manifest)
- `docs/protocol/` — SDD protocol, audit flow, ingestion flow

### Path Aliases

- `@/*` → `./*` (tsconfig)
- `@domain` → `./src/domain`, `@frontend` → `./src/frontend`, `@server` → `./src/server`, `@test` → `./test` (vitest only)

### Spec-Driven Development (SDD)

This repo uses a multi-agent workflow: humans write briefs, an architect agent generates specs, and the orchestrator executes them. See `README.md` for the full workflow. Key commands:

```bash
# Generate spec from brief (in Claude Code)
/architect @docs/tasks/ongoing/<feature>/<feature>-brief.md

# Execute spec
pnpm tsx scripts/orchestrate.ts docs/tasks/ongoing/<feature>/<feature>-spec.md

# Resume from a failed step
pnpm tsx scripts/orchestrate.ts <spec> --from N.M
```

## Code Style & Lint Rules

- **No barrel exports:** `export * from '...'` is forbidden — use named exports
- **Sorted exports:** Alphabetical ordering enforced by eslint-plugin-sort
- **Import ordering:** Enforced by Prettier plugin — third-party first, then scoped `@src/`, then relative
- **Unused vars:** Must be prefixed with `_` (e.g., `_unusedParam`)
- **No `.only` in tests:** `describe.only`, `it.only`, `test.only` are lint errors
- **Formatting:** Single quotes, trailing commas, semicolons, 2-space indent

## Testing

- **Config:** `vitest.config.unit.ts`
- **Environment:** jsdom
- **Test location:** `test/unit/**/*.{test,spec}.{ts,tsx}`
- **Coverage:** v8 provider, covers `src/domain/**` only
- **Globals:** enabled — no need to import `describe`, `it`, `expect`

## Doctrine System

Architectural doctrines in `docs/doctrine/architecture/` are binding standards loaded by the architect agent. The manifest at `docs/doctrine/doctrine-manifest.yaml` maps trigger keywords to doctrine files. Key doctrines:

- **Database:** Convex schema, queries/mutations/actions patterns
- **Frontend:** React 19 + Tailwind CSS 4, flat component structure, Convex subscriptions for real-time data
- **Server:** Convex Actions for external APIs, structured error returns, Zod validation on all external responses
- **Style:** Small functions, object parameters with destructuring, intention-revealing names, explicit control flow
