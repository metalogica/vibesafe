# Database Doctrine (Convex)

**Version**: 1.1.0
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
│  │  audits · audit_events · audit_analyses                   │   │
│  │  audit_evaluations                                        │   │
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
    repoOwner: v.string(),
    repoName: v.string(),
    commitHash: v.optional(v.string()),  // Set after GitHub fetch
    status: v.union(
      v.literal("pending"),
      v.literal("fetching"),
      v.literal("analyzing"),
      v.literal("evaluating"),
      v.literal("complete"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    truncated: v.optional(v.boolean()),
    userId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_url", ["repoUrl"]),

  audit_events: defineTable({
    auditId: v.id("audits"),
    agent: v.union(
      v.literal("INGESTION"),
      v.literal("SECURITY_ANALYST"),
      v.literal("EVALUATOR"),
    ),
    message: v.string(),
    analysisId: v.optional(v.id("audit_analyses")),
  }).index("by_audit", ["auditId"]),

  audit_analyses: defineTable({
    auditId: v.id("audits"),
    seqNumber: v.number(),
    displayId: v.string(),
    category: v.string(),
    level: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    title: v.string(),
    description: v.string(),
    impact: v.optional(v.string()),
    filePath: v.optional(v.string()),
    fix: v.optional(v.string()),
  }).index("by_audit", ["auditId"]),

  audit_evaluations: defineTable({
    auditId: v.id("audits"),
    probability: v.number(),        // 0-100
    executiveSummary: v.string(),
    vulnerabilityCount: v.number(),  // Avoids N+1 queries for chart data
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
├── audits.ts                 # Audit CRUD + createAndStart mutation
├── auditEvents.ts            # Feed event CRUD
├── analyses.ts               # Analysis CRUD
├── evaluations.ts            # Evaluation CRUD
├── clients/
│   ├── github.ts             # GitHub REST API client
│   └── claude.ts             # Anthropic Messages API client
├── services/
│   ├── auditService.ts       # Legacy orchestration (analysis-only)
│   └── startAuditAction.ts   # Unified ingestion + analysis + evaluation
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
// Create + schedule action: validate, insert, schedule in one mutation
export const createAndStart = mutation({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) throw new Error("INVALID_URL");

    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    const auditId = await ctx.db.insert("audits", {
      repoUrl: normalizedUrl,
      repoOwner: parsed.owner,
      repoName: parsed.repo,
      status: "pending",
    });

    await ctx.scheduler.runAfter(0, internal.services.startAuditAction.startAudit, {
      auditId, owner: parsed.owner, repo: parsed.repo,
    });

    return { auditId, repoUrl: normalizedUrl };
  },
});

// Status update: return void
export const updateStatus = mutation({
  args: {
    auditId: v.id("audits"),
    status: v.union(
      v.literal("pending"),
      v.literal("fetching"),
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
// Unified pipeline action: ingest + analyze + evaluate
export const startAudit = internalAction({
  args: {
    auditId: v.id("audits"),
    owner: v.string(),
    repo: v.string(),
  },
  handler: async (ctx, { auditId, owner, repo }) => {
    const actionStart = Date.now(); // Wall-clock budget

    // Guarantee: every code path reaches 'complete' or 'failed'
    try {
      await runAuditPipeline(ctx, { auditId, owner, repo, actionStart });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected internal error";
      await ctx.runMutation(internal.audits.fail, { auditId, error: message });
    }
  },
});
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
         │ createAndStart()
         ▼
    ┌──────────┐
    │ fetching │ ◄─── Ingestion: GitHub tree + blob fetch
    └────┬─────┘
         │ files ingested
         ▼
    ┌───────────┐
    │ analyzing │ ◄─── Claude security analysis
    └─────┬─────┘
          │ vulnerabilities stored
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
| `PRIVATE_REPO` | Repository is private or inaccessible |
| `GITHUB_ERROR` | Failed to fetch repo contents |
| `RATE_LIMIT` | External API quota exceeded |
| `CLAUDE_ERROR` | Anthropic API failure |
| `INVALID_RESPONSE` | Claude returned malformed JSON |
| `BUDGET_EXCEEDED` | Action exceeded wall-clock time limit |

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
- MUST NOT store derived/computed values — except `vulnerabilityCount` on evaluations (avoids N+1 for chart data)
- MUST wrap long-running actions in try/catch to guarantee terminal state (`complete` or `failed`)
- SHOULD use `internal.*` for mutations called from actions
- SHOULD use `ctx.scheduler.runAfter(0, ...)` to trigger actions from mutations

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
| 1.1.0 | 2026-02-21 | Audit feature: added audit_events table, fetching status, optional commitHash, impact field, vulnerabilityCount, updated state machine and action patterns |
| 1.0.0 | 2026-02-21 | Initial Convex database doctrine for Vibesafe |

