# Domain Logic Doctrine (Convex)

**Version**: 1.1.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

---

## 2. Decision: Lightweight Domain Layer for Shared Pure Functions

Vibesafe has a lightweight `src/domain/` layer containing **pure functions** that are shared between the Convex backend and the frontend, or that are complex enough to warrant isolated unit testing. It does NOT have traditional DDD entities, factories, or repository abstractions.

### Rationale

| Concern | Traditional Approach | Vibesafe Approach |
|---------|---------------------|-------------------|
| Type definitions | `domain/types.ts` | `convex/schema.ts` (single source of truth) |
| Validation | Factory classes with Result types | Convex schema validators + Zod for external input |
| State transitions | Pure functions in domain | Inline in Convex mutations |
| Repository abstraction | `IRepository` ports | Direct `ctx.db` calls (Convex is the repository) |
| Error handling | Tagged union `DomainError` | Throw in queries, structured return in actions |
| Shared pure logic | Domain services | `src/domain/audit/` pure functions |

### What Goes in `src/domain/`

Extract logic into `src/domain/` when it meets ANY of these criteria:

1. **Shared between Convex backend and frontend** (e.g., `parseGitHubUrl`, `calculateSafetyProbability`)
2. **Complex enough for isolated unit testing** (e.g., `sanitizeVulnerabilities`, `normalizeGitHubError`)
3. **Safety-critical guards** that protect against runtime failure modes (e.g., `isOverBudget`, `shouldIncludeFile`)

### What Stays Inline in Convex

- State transitions (handled by mutations)
- Database queries and writes
- Simple validation (handled by Convex schema validators)
- Orchestration logic (lives in action handlers)

---

## 3. Where Logic Lives

```
src/domain/audit/                   # Pure functions (shared, testable)
├── parseGitHubUrl.ts               # URL parsing + validation
├── fileFilter.ts                   # Ingestion file inclusion rules
├── tokenEstimator.ts               # Token budget + file priority
├── evaluator.ts                    # Safety scoring + display formatting
├── actionBudget.ts                 # Wall-clock budget guard (FMEA #1)
├── normalizeGitHubError.ts         # GitHub error classification (FMEA #2)
└── sanitizeVulnerabilities.ts      # Post-Zod sanitization (FMEA #3)

convex/
├── schema.ts                       # Types + validation (source of truth)
├── audits.ts                       # Audit CRUD + createAndStart
├── auditEvents.ts                  # Feed event CRUD
├── analyses.ts                     # Analysis CRUD
├── evaluations.ts                  # Evaluation CRUD
├── clients/                        # External API clients
└── services/                       # Orchestration actions
```

- **Types**: Defined in `schema.ts`, inferred elsewhere via `Doc<"audits">`
- **Validation**: Convex schema validators for DB writes, Zod for external API input
- **State transitions**: Inline in mutations
- **Shared pure logic**: `src/domain/audit/` — imported by both Convex actions and frontend components
- **Business rules**: Inline in mutations unless shared or complex (then extract to `src/domain/`)

---

## 4. Type Inference Pattern

```typescript
// Convex generates types from schema
import { Doc, Id } from "./_generated/dataModel";

// Use Doc<"tableName"> for entity types
type Audit = Doc<"audits">;
type AuditAnalysis = Doc<"audit_analyses">;

// Use Id<"tableName"> for foreign keys
function getAnalyses(auditId: Id<"audits">) { ... }
```

MUST use Convex-generated types. MUST NOT duplicate type definitions.

---

## 5. Validation Pattern

### 5.1 Internal (Convex → Convex)

Convex schema validators handle this automatically:

```typescript
// schema.ts
audit_analyses: defineTable({
  level: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),
})
```

Invalid data is rejected before mutation runs. No extra validation needed.

### 5.2 External (API → Convex)

For external input (GitHub API, MinMax response), use Zod:

```typescript
// convex/services/schemas.ts
import { z } from "zod";

export const MinMaxAnalysisSchema = z.object({
  category: z.string(),
  level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  fix: z.string().optional(),
});

export type MinMaxAnalysis = z.infer<typeof MinMaxAnalysisSchema>;

// Usage in action
const parsed = MinMaxAnalysisSchema.safeParse(agentResponse);
if (!parsed.success) {
  return { success: false, error: { code: "INVALID_RESPONSE", message: parsed.error.message } };
}
```

---

## 6. Constants

```typescript
// convex/constants.ts

export const AUDIT_STATUS = {
  PENDING: "pending",
  ANALYZING: "analyzing",
  EVALUATING: "evaluating",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

// Usage: sort analyses by severity
analyses.sort((a, b) => SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]);
```

---

## 7. When to Extract

Extract logic into `src/domain/` when ANY of these apply:

1. **Shared between Convex and frontend** (e.g., `parseGitHubUrl` used in mutation args validation AND frontend URL normalization)
2. **Complex enough to warrant isolated testing** (more than 5 lines of logic with branching)
3. **Safety-critical guard** protecting against FMEA failure modes (e.g., budget overflow, input sanitization)
4. **Used 3+ times** across different mutations/queries

Until then, inline it.

---

## 8. Testing

### 8.1 Domain Pure Functions

Domain functions in `src/domain/audit/` are tested with Vitest in `test/unit/domain/audit/`:

```typescript
// test/unit/domain/audit/parseGitHubUrl.test.ts
import { parseGitHubUrl } from '@/src/domain/audit/parseGitHubUrl';

describe('parseGitHubUrl', () => {
  it('parses a valid GitHub URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner', repo: 'repo',
    });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
  });
});
```

### 8.2 Convex Functions

Tests go directly against Convex functions using `convex-test`:

```typescript
// convex/audits.test.ts
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

test("createAndStart sets status to pending", async () => {
  const t = convexTest(schema);

  const { auditId } = await t.mutation(api.audits.createAndStart, {
    repoUrl: "https://github.com/test/repo",
  });

  const audit = await t.query(api.audits.get, { auditId });
  expect(audit.status).toBe("pending");
});
```

### 8.3 Zod Schemas

```typescript
import { VulnerabilitySchema } from "./schemas";

test("rejects invalid severity level", () => {
  const result = VulnerabilitySchema.safeParse({
    category: "auth",
    level: "super-critical",
    title: "Test",
    description: "Test",
  });
  expect(result.success).toBe(false);
});
```

---

## 9. Future Extraction Path

If Vibesafe grows beyond the current scope:

1. Add more feature-specific directories under `src/domain/` (e.g., `src/domain/billing/`)
2. Create factory functions with Result types if invariants become complex
3. Create repository ports (`IAuditRepository`) only if multiple data sources appear
4. Move types from `convex/schema.ts` to `domain/types.ts` only if decoupling from Convex becomes necessary

This is a refactor, not a rewrite. The pure functions already extracted to `src/domain/audit/` form the foundation.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-21 | Audit feature: introduced src/domain/audit/ pure function layer for shared/testable/safety-critical logic; updated extraction criteria and testing patterns |
| 1.0.0 | 2026-02-21 | Initial doctrine — documented decision to skip domain layer |
