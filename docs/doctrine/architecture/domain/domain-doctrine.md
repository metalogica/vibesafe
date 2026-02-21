# Domain Logic Doctrine (Convex)

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

---

## 2. Decision: No Separate Domain Layer

Vibesafe does not have a standalone domain layer. This is intentional.

### Rationale

| Concern | Traditional Approach | Vibesafe Approach |
|---------|---------------------|-------------------|
| Type definitions | `domain/types.ts` | `convex/schema.ts` (single source of truth) |
| Validation | Factory classes with Result types | Convex schema validators (`v.string()`, `v.union()`) |
| State transitions | Pure functions in domain | Inline in Convex mutations |
| Repository abstraction | `IRepository` ports | Direct `ctx.db` calls (Convex is the repository) |
| Error handling | Tagged union `DomainError` | Throw in queries, structured return in actions |

### Why This Works for Vibesafe

1. **Simple domain** — Audits have linear state (pending → analyzing → evaluating → complete). No complex invariants.
2. **Convex handles persistence + validation** — Schema validators reject bad data at the edge.
3. **4-hour MVP** — Ceremony doesn't pay off until you have multiple consumers of domain logic.
4. **Single backend** — No need to abstract over multiple data sources.

---

## 3. Where Logic Lives

```
convex/
├── schema.ts           # Types + validation (source of truth)
├── audits.ts           # Audit CRUD + state transitions
├── analyses.ts         # Analysis CRUD
├── evaluations.ts      # Evaluation CRUD
└── services/
    └── auditService.ts # Agent orchestration
```

- **Types**: Defined in `schema.ts`, inferred elsewhere via `Doc<"audits">`
- **Validation**: Convex schema validators for DB writes, Zod for external API input
- **State transitions**: Inline in mutations
- **Business rules**: Inline in mutations (extract if reused 3+ times)

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

Extract logic into a pure function when:

1. **Used 3+ times** across different mutations/queries
2. **Complex enough to warrant isolated testing** (more than 5 lines)
3. **Shared between server and client** (rare in Convex)

Until then, inline it.

---

## 8. Testing

Tests go directly against Convex functions using `convex-test`:

```typescript
// convex/audits.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

test("createAudit sets status to pending", async () => {
  const t = convexTest(schema);

  const auditId = await t.mutation(api.audits.create, {
    repoUrl: "https://github.com/test/repo",
    commitHash: "abc123",
  });

  const audit = await t.query(api.audits.get, { auditId });
  expect(audit.status).toBe("pending");
});

test("cannot skip status states", async () => {
  const t = convexTest(schema);

  const auditId = await t.mutation(api.audits.create, {
    repoUrl: "https://github.com/test/repo",
    commitHash: "abc123",
  });

  // Should throw - can't go from pending to complete
  await expect(
    t.mutation(api.audits.updateStatus, { auditId, status: "complete" })
  ).rejects.toThrow("INVALID_STATE");
});
```

For Zod schemas:

```typescript
// convex/services/schemas.test.ts
import { expect, test } from "vitest";
import { MinMaxAnalysisSchema } from "./schemas";

test("rejects invalid severity level", () => {
  const result = MinMaxAnalysisSchema.safeParse({
    category: "auth",
    level: "super-critical", // invalid
    title: "Test",
    description: "Test",
  });

  expect(result.success).toBe(false);
});
```

---

## 9. Future Extraction Path

If Vibesafe grows and needs a proper domain layer:

1. Create `src/domain/` directory
2. Move types from `convex/schema.ts` to `domain/types.ts`
3. Create factory functions with Result types
4. Create repository ports (`IAuditRepository`)
5. Implement Convex adapter that wraps `ctx.db`

This is a refactor, not a rewrite. The inline logic extracts cleanly.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial doctrine — documented decision to skip domain layer |
