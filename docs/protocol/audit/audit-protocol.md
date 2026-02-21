## 1. Overview

This protocol defines how Vibesafe analyzes ingested repositories for security vulnerabilities. A single MinMax agent call analyzes the codebase, produces structured vulnerability findings, and a deterministic evaluator scores the results.

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

```
┌─────────────────┐
│  Ingest         │
│  complete       │
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
│  Call MinMax    │──── Error ────► status = failed
│  (single call)  │
└────────┬────────┘
         │ Success
         ▼
┌─────────────────┐
│  Validate       │──── Invalid ────► status = failed
│  response (Zod) │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│  For each vuln: │
│  - Generate ID  │
│  - Store record │
│  - Create event │
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
│  Calculate      │
│  probability    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Generate       │
│  summary        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Store          │
│  evaluation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create         │
│  evaluator event│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Update status  │
│  = complete     │
└─────────────────┘
```

---

## 4. Data Model

### 4.1 Schema Additions

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
  filePath: v.optional(v.string()),
  fix: v.optional(v.string()),
}).index("by_audit", ["auditId"]),

audit_evaluations: defineTable({
  auditId: v.id("audits"),
  probability: v.number(),         // 0-100
  executiveSummary: v.string(),
}).index("by_audit", ["auditId"]),

audit_events: defineTable({
  auditId: v.id("audits"),
  agent: v.union(
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

## 5. MinMax Integration

### 5.1 Request Format

```typescript
const response = await fetch(`${MINMAX_API_BASE}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MINMAX_API_KEY}`,
  },
  body: JSON.stringify({
    model: "minmax-security-1",  // Or appropriate model
    messages: [
      {
        role: "system",
        content: SECURITY_ANALYST_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildAnalysisPrompt(repoContents),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,  // Low temperature for consistency
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

### 5.4 Response Validation

```typescript
// convex/services/schemas.ts

import { z } from "zod";

export const VulnerabilitySchema = z.object({
  category: z.string(),
  level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  filePath: z.string().optional(),
  fix: z.string().optional(),
});

export const MinMaxResponseSchema = z.object({
  vulnerabilities: z.array(VulnerabilitySchema),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
```

---

## 6. Evaluation Logic

### 6.1 Probability Calculation

Deterministic scoring based on vulnerability count and severity.

```typescript
const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 5,
};

function calculateSafetyProbability(
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
function generateExecutiveSummary(
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

### 7.1 Event Creation

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
function generateAnalystMessage(
  vulnerability: Vulnerability,
  displayId: string
): string {
  const severityLabel = vulnerability.level.charAt(0).toUpperCase() + vulnerability.level.slice(1);

  // Build a natural language message
  const fileRef = vulnerability.filePath
    ? ` in ${vulnerability.filePath}`
    : "";

  return `Found ${vulnerability.title}${fileRef}. ${vulnerability.description.split('.')[0]}. This is a ${severityLabel} ${vulnerability.category} vulnerability (${displayId}).`;
}
```

**Example output:**

> "Found Unauthenticated Payment Session Creation in /api/create-checkout-session.ts. The endpoint accepts userId directly from the request body without verifying the caller's identity. This is a Critical authentication vulnerability (SEC-A-001)."

---

## 8. Service Implementation

```typescript
// convex/services/auditService.ts

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { MinMaxResponseSchema } from "./schemas";

export const runAudit = action({
  args: {
    auditId: v.id("audits"),
    files: v.array(v.object({
      path: v.string(),
      content: v.string(),
    })),
  },
  handler: async (ctx, { auditId, files }) => {

    // 1. Update status to analyzing
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "analyzing",
    });

    // 2. Call MinMax
    let minmaxResponse;
    try {
      minmaxResponse = await callMinMax(files);
    } catch (error) {
      await ctx.runMutation(internal.audits.fail, {
        auditId,
        error: error instanceof Error ? error.message : "MinMax API error",
      });
      return { success: false, error: { code: "AGENT_ERROR", message: "Analysis failed" } };
    }

    // 3. Validate response
    const parsed = MinMaxResponseSchema.safeParse(minmaxResponse);
    if (!parsed.success) {
      await ctx.runMutation(internal.audits.fail, {
        auditId,
        error: "Invalid response from security analyzer",
      });
      return { success: false, error: { code: "INVALID_RESPONSE", message: parsed.error.message } };
    }

    const vulnerabilities = parsed.data.vulnerabilities;

    // 4. Store each vulnerability + create feed event
    for (let i = 0; i < vulnerabilities.length; i++) {
      const vuln = vulnerabilities[i];
      const seqNumber = i + 1;
      const displayId = generateDisplayId(auditId, seqNumber);

      const analysisId = await ctx.runMutation(internal.analyses.create, {
        auditId,
        seqNumber,
        displayId,
        category: vuln.category,
        level: vuln.level,
        title: vuln.title,
        description: vuln.description,
        filePath: vuln.filePath,
        fix: vuln.fix,
      });

      await ctx.runMutation(internal.auditEvents.create, {
        auditId,
        agent: "SECURITY_ANALYST",
        message: generateAnalystMessage(vuln, displayId),
        analysisId,
      });
    }

    // 5. Update status to evaluating
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "evaluating",
    });

    // 6. Calculate probability + generate summary
    const probability = calculateSafetyProbability(vulnerabilities);
    const executiveSummary = generateExecutiveSummary(vulnerabilities);

    // 7. Store evaluation
    await ctx.runMutation(internal.evaluations.create, {
      auditId,
      probability,
      executiveSummary,
    });

    // 8. Create evaluator feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: "EVALUATOR",
      message: executiveSummary,
    });

    // 9. Mark complete
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "complete",
    });

    return {
      success: true,
      data: {
        vulnerabilityCount: vulnerabilities.length,
        probability,
      },
    };
  },
});

// Helper functions

function generateDisplayId(auditId: string, seqNumber: number): string {
  const shortId = auditId.slice(0, 1).toUpperCase();
  const seq = String(seqNumber).padStart(3, "0");
  return `SEC-${shortId}-${seq}`;
}

function generateAnalystMessage(vuln: Vulnerability, displayId: string): string {
  const severityLabel = vuln.level.charAt(0).toUpperCase() + vuln.level.slice(1);
  const fileRef = vuln.filePath ? ` in ${vuln.filePath}` : "";
  const firstSentence = vuln.description.split('.')[0];
  return `Found ${vuln.title}${fileRef}. ${firstSentence}. This is a ${severityLabel} ${vuln.category} vulnerability (${displayId}).`;
}

async function callMinMax(files: { path: string; content: string }[]): Promise<unknown> {
  const response = await fetch(`${process.env.MINMAX_API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MINMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: "minmax-security-1",
      messages: [
        { role: "system", content: SECURITY_ANALYST_SYSTEM_PROMPT },
        { role: "user", content: buildAnalysisPrompt(files) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`MinMax API error: ${response.status}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

---

## 9. Error Handling

| Error | Cause | Result |
|-------|-------|--------|
| MinMax API error | Network failure, 5xx, auth error | Audit fails, error stored |
| MinMax rate limit | 429 response | Audit fails, error: "Rate limit exceeded" |
| Invalid response | Response doesn't match Zod schema | Audit fails, error: "Invalid analyzer response" |
| Empty response | No `vulnerabilities` array | Treated as 0 vulnerabilities (100% safe) |

### 9.1 Failure Mutation

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
Ingest                  Audit Service            MinMax API            Database
  │                          │                       │                    │
  │  runAudit(auditId,       │                       │                    │
  │  files)                  │                       │                    │
  │─────────────────────────►│                       │                    │
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (analyzing)          │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  POST /chat/          │                    │
  │                          │  completions          │                    │
  │                          │──────────────────────►│                    │
  │                          │                       │                    │
  │                          │  { vulnerabilities }  │                    │
  │                          │◄──────────────────────│                    │
  │                          │                       │                    │
  │                          │  validate (Zod)       │                    │
  │                          │                       │                    │
  │                          │                       │                    │
  │                          │  for each vuln:       │                    │
  │                          │    create analysis    │                    │
  │                          │───────────────────────────────────────────►│
  │                          │    create event       │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │    (real-time      │
  │                          │                       │     to frontend)   │
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (evaluating)         │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  calculate score      │                    │
  │                          │  (pure function)      │                    │
  │                          │                       │                    │
  │                          │  create evaluation    │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  create evaluator     │                    │
  │                          │  event                │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │                          │  updateStatus         │                    │
  │                          │  (complete)           │                    │
  │                          │───────────────────────────────────────────►│
  │                          │                       │                    │
  │  { success, data }       │                       │                    │
  │◄─────────────────────────│                       │                    │
```

---

## 12. Testing

### 12.1 Unit Tests

| Test | Input | Expected |
|------|-------|----------|
| Display ID generation | auditId="abc", seq=1 | "SEC-A-001" |
| Display ID generation | auditId="xyz", seq=15 | "SEC-X-015" |
| Probability: no vulns | [] | 100 |
| Probability: 1 critical | [critical] | 60 |
| Probability: overflow | [5 critical] | 0 (clamped) |
| Summary: no vulns | [] | "No security vulnerabilities detected..." |
| Summary: mixed | [2 critical, 1 high] | Contains "2 Critical and 1 High" |

### 12.2 Integration Tests

| Test | Setup | Expected |
|------|-------|----------|
| Happy path | Valid files, MinMax returns 2 vulns | 2 analyses, 2 events, 1 evaluation, status=complete |
| No vulnerabilities | Valid files, MinMax returns [] | 0 analyses, 1 evaluation (100%), status=complete |
| MinMax error | MinMax returns 500 | status=failed, error stored |
| Invalid response | MinMax returns malformed JSON | status=failed, error="Invalid analyzer response" |

### 12.3 Mock MinMax for Tests

```typescript
vi.spyOn(global, "fetch").mockResolvedValue(
  new Response(
    JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            vulnerabilities: [
              {
                category: "authentication",
                level: "critical",
                title: "Test Vulnerability",
                description: "Test description.",
              },
            ],
          }),
        },
      }],
    }),
    { status: 200 }
  )
);
```

---

## 13. Environment Variables

```bash
MINMAX_API_BASE=https://api.minimax.io   # Or actual endpoint
MINMAX_API_KEY=sk-xxxx                    # Required
```

---

## 14. Future Enhancements (v1.1+)

| Enhancement | Description |
|-------------|-------------|
| Retrvr integration | Search for related CVEs/hacks per vulnerability |
| LLM-generated summary | Replace template summary with LLM call for richer prose |
| Chunked analysis | Split large repos across multiple MinMax calls |
| Confidence scores | Add confidence field to vulnerabilities |
| Fix verification | Re-audit specific files after user claims fix |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial audit protocol |
