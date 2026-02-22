**Version**: 1.1.0
**Status**: Binding
**Date**: 2026-02-21

## 1. Overview

This protocol defines how Vibesafe analyzes ingested repositories for security vulnerabilities. A single Claude (Anthropic) API call analyzes the codebase, produces structured vulnerability findings, and a deterministic evaluator scores the results.

**Note**: Analysis and evaluation run as phases 2-3 of the unified `startAuditAction`. Evaluator pure functions live in `src/domain/audit/evaluator.ts`. Post-Zod sanitization in `src/domain/audit/sanitizeVulnerabilities.ts`.

---

## 2. User Story

```
As a user,
I submit a repository for audit,
So that I can see security vulnerabilities and a safety score.

As a user,
I watch the Agent Activity Feed in real-time,
So that I understand what the system is finding.
```

---

## 3. Audit Flow

This runs as phases 2-3 inside `startAuditAction`, after ingestion completes.

```
┌─────────────────┐
│  Ingestion      │
│  complete       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Budget check   │──── Over budget ────► status = failed
│  (FMEA #1)      │     "Audit timed out"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update status  │
│  = analyzing    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Call Claude    │──── Error ────► status = failed
│  (single call)  │──── 429 ────► RATE_LIMIT
└────────┬────────┘
         │ Success
         ▼
┌─────────────────┐
│  Validate       │──── Invalid ────► status = failed
│  response (Zod) │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────────┐
│  Sanitize vulns     │  FMEA #3: clamp lengths, enforce enums,
│  (post-Zod)         │  drop invalid, cap at 50
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│  For each vuln: │
│  - Generate ID  │  generateDisplayId (from evaluator.ts)
│  - Store record │  including impact field
│  - Create event │  SECURITY_ANALYST agent event
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update status  │
│  = evaluating   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Calculate      │  calculateSafetyProbability (from evaluator.ts)
│  probability    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Generate       │  generateExecutiveSummary (from evaluator.ts)
│  summary        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Store          │  including vulnerabilityCount
│  evaluation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create         │  EVALUATOR agent event
│  evaluator event│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update status  │
│  = complete     │
└─────────────────┘

NOTE: Entire pipeline is wrapped in try/catch (FMEA #1).
If anything throws, catch block calls audits.fail → guaranteed terminal state.
```

---

## 4. Data Model

### 4.1 Schema

```typescript
// convex/schema.ts

audit_analyses: defineTable({
  auditId: v.id("audits"),
  seqNumber: v.number(),           // 1, 2, 3... for ID generation
  displayId: v.string(),           // "SEC-A-001"
  category: v.string(),            // "authentication", "injection", etc.
  level: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),
  title: v.string(),
  description: v.string(),
  impact: v.optional(v.string()),  // Business/security impact statement
  filePath: v.optional(v.string()),
  fix: v.optional(v.string()),
}).index("by_audit", ["auditId"]),

audit_evaluations: defineTable({
  auditId: v.id("audits"),
  probability: v.number(),         // 0-100
  executiveSummary: v.string(),
  vulnerabilityCount: v.number(),  // Avoids N+1 for chart data
}).index("by_audit", ["auditId"]),

audit_events: defineTable({
  auditId: v.id("audits"),
  agent: v.union(
    v.literal("INGESTION"),        // Events during repo fetching
    v.literal("SECURITY_ANALYST"),
    v.literal("EVALUATOR")
  ),
  message: v.string(),
  analysisId: v.optional(v.id("audit_analyses")),
}).index("by_audit", ["auditId"]),
```

### 4.2 Display ID Generation

Format: `SEC-{auditShortId}-{seqNumber}`

```typescript
function generateDisplayId(auditId: string, seqNumber: number): string {
  // Take first 1 char of audit ID (uppercase)
  const shortId = auditId.slice(0, 1).toUpperCase();
  // Pad sequence number to 3 digits
  const seq = String(seqNumber).padStart(3, "0");
  return `SEC-${shortId}-${seq}`;
}

// Example: audit ID "abc123", seq 1 → "SEC-A-001"
// Example: audit ID "abc123", seq 2 → "SEC-A-002"
```

---

## 5. Claude Integration

### 5.1 Request Format

**File: `convex/clients/claude.ts`**

```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.CLAUDE_CODE_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    system: SECURITY_ANALYST_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildAnalysisPrompt(files),
      },
    ],
  }),
});
```

### 5.2 System Prompt

```typescript
const SECURITY_ANALYST_SYSTEM_PROMPT = `You are an expert security analyst reviewing codebases for vulnerabilities.

Your task is to identify security vulnerabilities in the provided code.

For each vulnerability found, provide:
- category: The type of vulnerability (e.g., "authentication", "authorization", "injection", "exposure", "cryptography", "configuration")
- level: Severity as one of: "low", "medium", "high", "critical"
- title: A short, descriptive title (e.g., "Unauthenticated Payment Session Creation")
- description: A detailed explanation of the vulnerability and its impact
- impact: A concise statement of the business or security impact if exploited (e.g., "Enables unauthorized access to all user payment data")
- filePath: The file path where the vulnerability exists (if applicable, omit if architectural)
- fix: A recommended remediation (if applicable)

Severity guidelines:
- critical: Immediate exploitation possible, severe impact (data breach, financial loss, RCE)
- high: Exploitation likely, significant impact (privilege escalation, sensitive data exposure)
- medium: Exploitation possible with effort, moderate impact (information disclosure, DoS)
- low: Minor issues, limited impact (best practice violations, minor info leaks)

Respond with a JSON object containing a "vulnerabilities" array. If no vulnerabilities are found, return an empty array.

Example response:
{
  "vulnerabilities": [
    {
      "category": "authentication",
      "level": "critical",
      "title": "Unauthenticated Payment Session Creation",
      "description": "The /api/create-checkout-session endpoint accepts userId directly from the request body without verifying the caller's identity.",
      "impact": "Allows attackers to create checkout sessions for any user, enabling payment fraud and credit theft.",
      "filePath": "/api/create-checkout-session.ts",
      "fix": "Replace client-provided userId with server-side session authentication."
    }
  ]
}`;
```

### 5.3 User Prompt

```typescript
function buildAnalysisPrompt(files: { path: string; content: string }[]): string {
  const fileContents = files
    .map((f) => `// File: ${f.path}\n${f.content}`)
    .join("\n\n---\n\n");

  return `Analyze the following codebase for security vulnerabilities:

${fileContents}

Identify all security vulnerabilities and respond with JSON.`;
}
```

### 5.4 Response Validation (Zod)

```typescript
// convex/services/schemas.ts

import { z } from "zod";

export const VulnerabilitySchema = z.object({
  category: z.string(),
  level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  impact: z.string().optional(),       // NEW: business/security impact
  filePath: z.string().optional(),
  fix: z.string().optional(),
});

export const ClaudeAnalysisResponseSchema = z.object({
  vulnerabilities: z.array(VulnerabilitySchema),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
```

### 5.5 Post-Zod Sanitization (FMEA #3)

**File: `src/domain/audit/sanitizeVulnerabilities.ts`**

After Zod structural validation, apply sanitization before database insertion:

```typescript
const vulnerabilities = sanitizeVulnerabilities(
  analysisResult.data.vulnerabilities as Record<string, unknown>[],
);
```

Sanitization rules:
- **Clamp field lengths**: title (200), description (2000), impact (1000), fix (2000), filePath (500), category (100)
- **Enforce severity enum**: drop entries with unknown levels
- **Drop invalid entries**: empty title or empty description → null (filtered out)
- **Cap count**: maximum 50 vulnerabilities per audit

This protects against Claude returning structurally valid but semantically problematic JSON (e.g., 500-character titles, 100 vulnerabilities, unknown severity levels).

---

## 6. Evaluation Logic

All evaluator functions live in **`src/domain/audit/evaluator.ts`** (pure functions, shared by Convex actions and frontend).

### 6.1 Probability Calculation

Deterministic scoring based on vulnerability count and severity.

```typescript
// src/domain/audit/evaluator.ts

export const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
};

export function calculateSafetyProbability(
  vulnerabilities: { level: string }[]
): number {
  if (vulnerabilities.length === 0) return 100;

  const totalPenalty = vulnerabilities.reduce(
    (sum, v) => sum + (SEVERITY_PENALTIES[v.level] ?? 0),
    0
  );

  // Clamp to 0-100
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}
```

**Examples:**

| Vulnerabilities | Penalty | Score |
|-----------------|---------|-------|
| None | 0 | 100% |
| 1 low | 5 | 95% |
| 1 medium | 10 | 90% |
| 1 high | 25 | 75% |
| 1 critical | 40 | 60% |
| 3 critical + 2 high | 170 | 0% |
| 1 critical + 1 high + 2 medium | 85 | 15% |

### 6.2 Executive Summary Generation

Deterministic template-based summary.

```typescript
export function generateExecutiveSummary(
  vulnerabilities: { level: string; category: string }[]
): string {
  if (vulnerabilities.length === 0) {
    return "No security vulnerabilities detected. This codebase appears safe for deployment.";
  }

  const counts = {
    critical: vulnerabilities.filter((v) => v.level === "critical").length,
    high: vulnerabilities.filter((v) => v.level === "high").length,
    medium: vulnerabilities.filter((v) => v.level === "medium").length,
    low: vulnerabilities.filter((v) => v.level === "low").length,
  };

  // Build severity summary
  const severityParts: string[] = [];
  if (counts.critical > 0) severityParts.push(`${counts.critical} Critical`);
  if (counts.high > 0) severityParts.push(`${counts.high} High`);
  if (counts.medium > 0) severityParts.push(`${counts.medium} Medium`);
  if (counts.low > 0) severityParts.push(`${counts.low} Low`);
  const severitySummary = severityParts.join(" and ");

  // Identify affected areas
  const categories = [...new Set(vulnerabilities.map((v) => v.category))];
  const areaSummary = categories.slice(0, 3).join(", ");

  // Determine verdict
  let verdict: string;
  if (counts.critical > 0) {
    verdict = "Deployment unsafe.";
  } else if (counts.high > 0) {
    verdict = "Deployment not recommended until issues are resolved.";
  } else if (counts.medium > 0) {
    verdict = "Deployment acceptable with caution. Address issues soon.";
  } else {
    verdict = "Deployment acceptable. Consider addressing minor issues.";
  }

  return `Audit Complete. ${severitySummary} severity vulnerabilities found. Affected areas: ${areaSummary}. ${verdict}`;
}
```

**Examples:**

| Input | Output |
|-------|--------|
| 0 vulnerabilities | "No security vulnerabilities detected. This codebase appears safe for deployment." |
| 3 critical, 2 high (auth, payment) | "Audit Complete. 3 Critical and 2 High severity vulnerabilities found. Affected areas: authentication, payment. Deployment unsafe." |
| 2 medium, 1 low (config, logging) | "Audit Complete. 2 Medium and 1 Low severity vulnerabilities found. Affected areas: configuration, logging. Deployment acceptable with caution. Address issues soon." |

---

## 7. Agent Activity Feed

Three agent types create feed events:

| Agent | Color | Events |
|-------|-------|--------|
| `INGESTION` | Indigo | "Fetching repository...", "Found N source files...", "Ingestion complete..." |
| `SECURITY_ANALYST` | Emerald | One event per vulnerability found |
| `EVALUATOR` | Purple | Executive summary |

### 7.1 Event Creation

**During ingestion:**

```typescript
await ctx.runMutation(internal.auditEvents.create, {
  auditId,
  agent: "INGESTION",
  message: `Fetching repository ${owner}/${repo} from GitHub...`,
});
```

**On each vulnerability found:**

```typescript
await ctx.runMutation(internal.auditEvents.create, {
  auditId,
  agent: "SECURITY_ANALYST",
  message: generateAnalystMessage(vulnerability, displayId),
  analysisId,
});
```

**On evaluation complete:**

```typescript
await ctx.runMutation(internal.auditEvents.create, {
  auditId,
  agent: "EVALUATOR",
  message: executiveSummary,
});
```

### 7.2 Analyst Message Generation

```typescript
// src/domain/audit/evaluator.ts
export function generateAnalystMessage(
  vuln: { level: string; category: string; title: string; description: string; filePath?: string },
  displayId: string
): string {
  const severityLabel = vuln.level.charAt(0).toUpperCase() + vuln.level.slice(1);
  const fileRef = vuln.filePath ? ` in ${vuln.filePath}` : "";
  const firstSentence = vuln.description.split('.')[0];
  return `Found ${vuln.title}${fileRef}. ${firstSentence}. This is a ${severityLabel} ${vuln.category} vulnerability (${displayId}).`;
}
```

**Example output:**

> "Found Unauthenticated Payment Session Creation in /api/create-checkout-session.ts. The endpoint accepts userId directly from the request body without verifying the caller's identity. This is a Critical authentication vulnerability (SEC-A-001)."

---

## 8. Service Implementation

The analysis and evaluation phases are part of `startAuditAction` (see full action in audit-spec.md Section 5.1). Key patterns:

```typescript
// convex/services/startAuditAction.ts (analysis + evaluation phases)

// Imports from domain layer
import { calculateSafetyProbability, generateExecutiveSummary, generateDisplayId, generateAnalystMessage } from "../../src/domain/audit/evaluator";
import { sanitizeVulnerabilities } from "../../src/domain/audit/sanitizeVulnerabilities";
import { runSecurityAnalysis } from "../clients/claude";

// === ANALYSIS PHASE (inside runAuditPipeline) ===

// 1. Budget check before expensive Claude call
if (isOverBudget(actionStart)) {
  await ctx.runMutation(internal.audits.fail, {
    auditId, error: "Audit timed out during ingestion. Try a smaller repository.",
  });
  return;
}

await ctx.runMutation(internal.audits.updateStatus, { auditId, status: "analyzing" });

// 2. Call Claude
const analysisResult = await runSecurityAnalysis(files);
if (!analysisResult.success) {
  await ctx.runMutation(internal.audits.fail, { auditId, error: analysisResult.error.message });
  return;
}

// 3. FMEA #3: Sanitise after Zod validation
const vulnerabilities = sanitizeVulnerabilities(
  analysisResult.data.vulnerabilities as Record<string, unknown>[],
);

// 4. Store each vulnerability + create feed event
for (let i = 0; i < vulnerabilities.length; i++) {
  const vuln = vulnerabilities[i];
  const seqNumber = i + 1;
  const displayId = generateDisplayId(auditId, seqNumber);

  const analysisId = await ctx.runMutation(internal.analyses.create, {
    auditId, seqNumber, displayId,
    category: vuln.category, level: vuln.level,
    title: vuln.title, description: vuln.description,
    impact: vuln.impact,               // NEW: impact field
    filePath: vuln.filePath, fix: vuln.fix,
  });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId, agent: "SECURITY_ANALYST",
    message: generateAnalystMessage(vuln, displayId),
    analysisId,
  });
}

// === EVALUATION PHASE ===

await ctx.runMutation(internal.audits.updateStatus, { auditId, status: "evaluating" });

const probability = calculateSafetyProbability(vulnerabilities);
const executiveSummary = generateExecutiveSummary(vulnerabilities);

await ctx.runMutation(internal.evaluations.create, {
  auditId, probability, executiveSummary,
  vulnerabilityCount: vulnerabilities.length,  // NEW: stored for chart data
});

await ctx.runMutation(internal.auditEvents.create, {
  auditId, agent: "EVALUATOR", message: executiveSummary,
});

await ctx.runMutation(internal.audits.updateStatus, { auditId, status: "complete" });
```

**Key differences from v1.0:**
- Pure functions imported from `src/domain/audit/evaluator.ts` (not defined inline)
- `sanitizeVulnerabilities()` applied after Zod parse (FMEA #3)
- `impact` field passed to `analyses.create`
- `vulnerabilityCount` stored on evaluation record
- Entire pipeline wrapped in try/catch (FMEA #1, see Section 3 flow diagram)

---

## 9. Error Handling

| Error | Cause | Result |
|-------|-------|--------|
| Claude API error | Network failure, 5xx, auth error | Audit fails, error stored |
| Claude rate limit | 429 response | Audit fails, error: "Anthropic rate limit exceeded" |
| Invalid response | Response doesn't match Zod schema | Audit fails, error: "Invalid Anthropic response" |
| Empty response | No `vulnerabilities` array | Treated as 0 vulnerabilities (100% safe) |
| Budget exceeded | Wall-clock > 540s before Claude call | Audit fails, error: "Audit timed out" |
| Unexpected throw | Any uncaught exception | Catch block calls `audits.fail` (FMEA #1) |

### 9.1 Terminal State Guarantee (FMEA #1)

The `startAudit` action wraps its entire pipeline in try/catch:

```typescript
export const startAudit = internalAction({
  handler: async (ctx, { auditId, owner, repo }) => {
    try {
      await runAuditPipeline(ctx, { auditId, owner, repo, actionStart: Date.now() });
    } catch (err) {
      // Belt-and-suspenders: force terminal state on any unexpected throw
      const message = err instanceof Error ? err.message : "Unexpected internal error";
      await ctx.runMutation(internal.audits.fail, { auditId, error: message });
    }
  },
});
```

This guarantees every audit reaches `complete` or `failed` — never stuck in `pending`/`fetching`/`analyzing`/`evaluating`.

### 9.2 Failure Mutation

```typescript
// convex/audits.ts

export const fail = internalMutation({
  args: {
    auditId: v.id("audits"),
    error: v.string(),
  },
  handler: async (ctx, { auditId, error }) => {
    await ctx.db.patch(auditId, {
      status: "failed",
      error,
    });
  },
});
```

---

## 10. Real-Time Subscriptions

### 10.1 Feed Query

```typescript
// convex/auditEvents.ts

export const listByAudit = query({
  args: { auditId: v.id("audits") },
  handler: async (ctx, { auditId }) => {
    return await ctx.db
      .query("audit_events")
      .withIndex("by_audit", (q) => q.eq("auditId", auditId))
      .order("asc")  // Oldest first for chronological feed
      .collect();
  },
});
```

### 10.2 Frontend Usage

```typescript
// Feed component
const events = useQuery(api.auditEvents.listByAudit, { auditId });

// Events appear in real-time as mutations create them
```

---

## 11. Sequence Diagram

```
Ingestion Phase         startAuditAction          Claude API            Database
  │                          │                       │                    │
  │  (files ingested)        │                       │                    │
  │─────────────────────────►│                       │                    │
  │                          │                       │                    │
  │                          │  budget check         │                    │
  │                          │  (FMEA #1)            │                    │
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (analyzing)          │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  POST /v1/messages    │                    │
  │                          │──────────────────────►│                    │
  │                          │                       │                    │
  │                          │  { vulnerabilities }  │                    │
  │                          │◄──────────────────────│                    │
  │                          │                       │                    │
  │                          │  validate (Zod)       │                    │
  │                          │  sanitize (FMEA #3)   │                    │
  │                          │                       │                    │
  │                          │  for each vuln:       │                    │
  │                          │    create analysis    │                    │
  │                          │    (with impact)      │                    │
  │                          │───────────────────────────────────────────►│
  │                          │    create event       │    (real-time      │
  │                          │───────────────────────────────────────────►│ to frontend)
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (evaluating)         │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  calculateSafety      │                    │
  │                          │  Probability()        │                    │
  │                          │  (pure fn from        │                    │
  │                          │   evaluator.ts)       │                    │
  │                          │                       │                    │
  │                          │  create evaluation    │                    │
  │                          │  (+ vulnCount)        │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  EVALUATOR event      │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (complete)           │                    │
  │                          │───────────────────────────────────────────►│
```

---

## 12. Testing

### 12.1 Unit Tests (in `test/unit/domain/audit/`)

| Test File | Key Cases |
|-----------|-----------|
| `evaluator.test.ts` | Display ID generation, probability calculation (0 vulns → 100, 1 critical → 60, 5 critical → 0 clamped), executive summary templates |
| `sanitizeVulnerabilities.test.ts` | Field truncation at limits, dropping invalid entries, cap at 50, pass-through of valid data |

See also `auditMappers.test.ts` in `test/unit/frontend/lib/` for frontend contract tests.

### 12.2 Integration Tests

| Test | Setup | Expected |
|------|-------|----------|
| Happy path | Valid files, Claude returns 2 vulns | 2 analyses (with impact), 2 SECURITY_ANALYST events, 1 evaluation (with vulnCount), status=complete |
| No vulnerabilities | Valid files, Claude returns [] | 0 analyses, 1 evaluation (100%), status=complete |
| Claude error | Claude returns 500 | status=failed, error stored |
| Claude rate limit | Claude returns 429 | status=failed, error="Anthropic rate limit exceeded" |
| Invalid response | Claude returns malformed JSON | status=failed, error="Invalid Anthropic response" |
| Budget exceeded | Wall-clock > 540s before Claude call | status=failed, error="Audit timed out" |

---

## 13. Environment Variables

```bash
# Set in Convex dashboard (server-side, accessed via process.env in actions)
CLAUDE_CODE_API_KEY=sk-xxxx      # Anthropic API key (required)
GITHUB_API_KEY=ghp_xxxx          # GitHub personal access token (required for 5k/hr rate limit)

# Set in .env.local (client-side)
NEXT_PUBLIC_CONVEX_URL=https://xxx.convex.cloud
```

---

## 14. FMEA Summary

| # | Failure Mode | Mitigation | Implementation |
|---|-------------|------------|----------------|
| 1 | Action exceeds runtime / stalls | Wall-clock budget + try/catch envelope | `actionBudget.ts` + action wrapper |
| 2 | GitHub rate limit misclassified | Centralised `normalizeGitHubError` | `normalizeGitHubError.ts` |
| 3 | Claude returns bad semantics | Post-Zod sanitisation layer | `sanitizeVulnerabilities.ts` |
| 4 | Frontend/Convex contract drift | Mapper contract tests | `auditMappers.test.ts` |

---

## 15. Future Enhancements (v1.1+)

| Enhancement | Description |
|-------------|-------------|
| CVE enrichment | Search for related CVEs/hacks per vulnerability |
| LLM-generated summary | Replace template summary with LLM call for richer prose |
| Chunked analysis | Split large repos across multiple Claude calls |
| Confidence scores | Add confidence field to vulnerabilities |
| Fix verification | Re-audit specific files after user claims fix |
| Audit comparison | Diff vulnerability sets between audit runs |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-21 | Replace MinMax with Claude (Anthropic); add impact field; FMEA mitigations (budget, sanitization, terminal state guarantee); INGESTION agent; vulnerabilityCount on evaluations; domain pure function references; unified action model |
| 1.0.0 | 2026-02-21 | Initial audit protocol |
