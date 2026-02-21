# Database Doctrine (Convex)

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `convex/`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Convex                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Tables                               │   │
│  │  audits · audit_evaluations · audit_analyses              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Functions                              │   │
│  │  queries (read) · mutations (write) · actions (external)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Auth (ctx.auth)                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  audits: defineTable({
    repoUrl: v.string(),
    commitHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("analyzing"),
      v.literal("evaluating"),
      v.literal("complete"),
      v.literal("failed")
    ),
    userId: v.optional(v.string()), // GitHub user or anonymous
  })
    .index("by_user", ["userId"])
    .index("by_repo", ["repoUrl"]),

  audit_evaluations: defineTable({
    auditId: v.id("audits"),
    probability: v.number(), // 0-100
    executiveSummary: v.string(),
  }).index("by_audit", ["auditId"]),

  audit_analyses: defineTable({
    auditId: v.id("audits"),
    category: v.string(),
    level: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    title: v.string(),
    description: v.string(),
    filePath: v.optional(v.string()),
    fix: v.optional(v.string()),
    links: v.optional(v.array(v.string())),
  }).index("by_audit", ["auditId"]),
});
```

---

## 4. Naming Conventions

| Object | Pattern | Example |
|--------|---------|---------|
| Tables | `snake_case`, plural | `audit_analyses` |
| Fields | `camelCase` | `commitHash`, `auditId` |
| Functions | `camelCase` verb | `createAudit`, `getAuditsByUser` |
| Indexes | `by_<field>` | `by_audit`, `by_user` |

---

## 5. Function Patterns

### 5.1 Directory Layout

```
convex/
├── schema.ts                 # Schema definition
├── audits.ts                 # Audit CRUD
├── analyses.ts               # Analysis CRUD
├── evaluations.ts            # Evaluation CRUD
├── services/
│   └── auditService.ts       # Orchestration actions
└── _generated/               # Auto-generated (do not edit)
```

### 5.2 Query Pattern

```typescript
// Simple read: throw on not found
export const get = query({
  args: { auditId: v.id("audits") },
  handler: async (ctx, { auditId }) => {
    const audit = await ctx.db.get(auditId);
    if (!audit) throw new Error("NOT_FOUND");
    return audit;
  },
});

// List: return empty array, never throw
export const listByRepo = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    return await ctx.db
      .query("audits")
      .withIndex("by_repo", (q) => q.eq("repoUrl", repoUrl))
      .collect();
  },
});
```

### 5.3 Mutation Pattern

```typescript
// Simple write: return ID
export const create = mutation({
  args: { repoUrl: v.string(), commitHash: v.string() },
  handler: async (ctx, { repoUrl, commitHash }) => {
    const auditId = await ctx.db.insert("audits", {
      repoUrl,
      commitHash,
      status: "pending",
    });
    return auditId;
  },
});

// Status update: return void
export const updateStatus = mutation({
  args: {
    auditId: v.id("audits"),
    status: v.union(
      v.literal("pending"),
      v.literal("analyzing"),
      v.literal("evaluating"),
      v.literal("complete"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, { auditId, status }) => {
    await ctx.db.patch(auditId, { status });
  },
});
```

### 5.4 Action Pattern (External APIs)

```typescript
// For MinMax/Retrvr calls: structured return
export const runAnalysis = action({
  args: { auditId: v.id("audits") },
  handler: async (ctx, { auditId }): Promise<AnalysisResult> => {
    try {
      // Call MinMax agent
      const analyses = await minmaxClient.analyze(repoContents);

      // Write to DB via mutation
      await ctx.runMutation(internal.analyses.createBatch, {
        auditId,
        analyses,
      });

      return { success: true, data: { count: analyses.length } };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "AGENT_ERROR",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      };
    }
  },
});

// Type for structured returns
type AnalysisResult =
  | { success: true; data: { count: number } }
  | { success: false; error: { code: string; message: string } };
```

---

## 6. Auth Pattern

### 6.1 Optional Auth (MVP)

For MVP with public repos, auth is optional:

```typescript
export const create = mutation({
  args: { repoUrl: v.string(), commitHash: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    return await ctx.db.insert("audits", {
      ...args,
      status: "pending",
      userId: identity?.subject ?? undefined,
    });
  },
});
```

### 6.2 Required Auth (Future)

When auth becomes required:

```typescript
async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHORIZED");
  return identity;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    return await ctx.db
      .query("audits")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});
```

---

## 7. Real-Time Pattern

Convex provides real-time by default. Queries automatically update when underlying data changes.

```typescript
// Frontend: useQuery subscribes to changes
const analyses = useQuery(api.analyses.listByAudit, { auditId });

// As mutations insert new analyses, the UI updates automatically
```

For the agent activity feed, insert `audit_analyses` rows as they're generated — the frontend subscription handles the rest.

---

## 8. State Machine: Audit Lifecycle

```
    ┌─────────┐
    │ pending │
    └────┬────┘
         │ startAudit()
         ▼
    ┌───────────┐
    │ analyzing │ ◄─── MinMax writing analyses
    └─────┬─────┘
          │ all analyses complete
          ▼
    ┌────────────┐
    │ evaluating │ ◄─── Evaluator aggregating
    └─────┬──────┘
          │ evaluation written
          ▼
    ┌──────────┐
    │ complete │
    └──────────┘

    (any state) ──► failed (on unrecoverable error)
```

**Transition Rules:**
- MUST transition through states in order (no skipping)
- MUST set `failed` on unrecoverable error (with error in evaluation summary)
- Analyses MAY be written incrementally during `analyzing` state

---

## 9. Error Handling

### 9.1 Error Codes

| Code | Meaning |
|------|---------|
| `UNAUTHORIZED` | Auth required but not present |
| `NOT_FOUND` | Entity does not exist |
| `INVALID_STATE` | Operation not valid in current audit state |
| `AGENT_ERROR` | MinMax/Retrvr call failed |
| `GITHUB_ERROR` | Failed to fetch repo contents |
| `RATE_LIMIT` | External API quota exceeded |

### 9.2 When to Throw vs Return

| Context | Pattern |
|---------|---------|
| Query not found | Throw `NOT_FOUND` |
| Mutation validation | Throw with message |
| Action external call | Return `{ success: false, error }` |
| Action partial success | Return `{ success: true, data }` with partial data |

---

## 10. Operational Rules

- MUST use `v.id("table")` for foreign keys (not `v.string()`)
- MUST define indexes for all query patterns
- MUST NOT store derived/computed values (compute in queries)
- SHOULD use `internal.*` for mutations called from actions
- SHOULD keep actions thin (orchestration only, logic in mutations)

---

## 11. Testing Expectations

| Layer | Test Focus | Tool |
|-------|------------|------|
| Schema | Type safety | TypeScript compiler |
| Queries | Return shape, index usage | Convex dashboard / unit tests |
| Mutations | State transitions | Integration tests |
| Actions | External API mocking | Vitest with mocked clients |

---

## 12. Change Protocol

**Modifications REQUIRE**:
- Schema changes auto-migrate (Convex handles this)
- New indexes require `npx convex dev` restart
- Breaking changes to function signatures require frontend updates

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial Convex database doctrine for Vibesafe |

