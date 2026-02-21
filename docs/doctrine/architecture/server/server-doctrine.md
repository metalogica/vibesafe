# Services Doctrine (Convex Actions + External APIs)

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Convex Actions                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Audit Service                          │    │
│  │            (orchestrates the audit flow)                 │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │   GitHub   │  │   MinMax   │  │   Retrvr   │                │
│  │   Client   │  │   Client   │  │   Client   │                │
│  └────────────┘  └────────────┘  └────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
convex/
├── services/
│   ├── auditService.ts      # Orchestration action
│   └── schemas.ts           # Zod schemas for external responses
│
├── clients/
│   ├── github.ts            # GitHub API client
│   ├── minimax.ts            # MiniMax agent client
│   └── retrvr.ts            # Retrvr.ai client
│
└── _generated/
```

---

## 4. Client Pattern

### 4.1 Base Client Structure

```typescript
// convex/clients/github.ts

const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubFile {
  path: string;
  content: string;
}

export interface GitHubClientResult<T> {
  success: true;
  data: T;
} | {
  success: false;
  error: { code: string; message: string };
}

export async function fetchRepoContents(
  repoUrl: string
): Promise<GitHubClientResult<GitHubFile[]>> {
  try {
    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      return {
        success: false,
        error: { code: "INVALID_URL", message: "Invalid GitHub URL format" },
      };
    }

    const [, owner, repo] = match;

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          // Add token if available for higher rate limits
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: response.status === 404 ? "NOT_FOUND" : "GITHUB_ERROR",
          message: `GitHub API error: ${response.status}`,
        },
      };
    }

    const files = await response.json();
    return { success: true, data: files };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
```

### 4.2 MinMax Client

```typescript
// convex/clients/minmax.ts

import { z } from "zod";
import { MinMaxAnalysisSchema } from "../services/schemas";

const MINMAX_API_BASE = "https://api.minimax.io"; // Replace with actual

export interface MinMaxAnalysis {
  category: string;
  level: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  filePath?: string;
  fix?: string;
}

export interface MinMaxClientResult {
  success: true;
  data: { analyses: MinMaxAnalysis[] };
} | {
  success: false;
  error: { code: string; message: string };
}

export async function runSecurityAnalysis(
  repoContents: string,
  options?: { maxVulnerabilities?: number }
): Promise<MinMaxClientResult> {
  try {
    const response = await fetch(`${MINMAX_API_BASE}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINMAX_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: buildSecurityPrompt(repoContents),
        max_results: options?.maxVulnerabilities ?? 10,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: { code: "RATE_LIMIT", message: "MinMax rate limit exceeded" },
        };
      }
      return {
        success: false,
        error: { code: "MINMAX_ERROR", message: `API error: ${response.status}` },
      };
    }

    const raw = await response.json();

    // Validate response shape
    const parsed = z.array(MinMaxAnalysisSchema).safeParse(raw.analyses);
    if (!parsed.success) {
      return {
        success: false,
        error: { code: "INVALID_RESPONSE", message: parsed.error.message },
      };
    }

    return { success: true, data: { analyses: parsed.data } };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

function buildSecurityPrompt(repoContents: string): string {
  return `
You are a security analyst. Analyze this codebase for vulnerabilities.

For each vulnerability found, provide:
- category: The type (e.g., "authentication", "injection", "exposure")
- level: "low" | "medium" | "high" | "critical"
- title: Short description
- description: Detailed explanation
- filePath: The file containing the vulnerability (if applicable)
- fix: Recommended remediation

Codebase:
${repoContents}
`.trim();
}
```

### 4.3 Retrvr Client

```typescript
// convex/clients/retrvr.ts

const RETRVR_API_BASE = "https://api.retriever.ai"; // Replace with actual

export interface RetrvrLink {
  url: string;
  title: string;
  snippet: string;
}

export interface RetrvrClientResult {
  success: true;
  data: { links: RetrvrLink[] };
} | {
  success: false;
  error: { code: string; message: string };
}

export async function searchRelatedHacks(
  vulnerabilityTitle: string
): Promise<RetrvrClientResult> {
  try {
    const response = await fetch(`${RETRVR_API_BASE}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RETRVR_API_KEY}`,
      },
      body: JSON.stringify({
        query: `${vulnerabilityTitle} security breach exploit CVE`,
        max_results: 3,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: "RETRVR_ERROR", message: `API error: ${response.status}` },
      };
    }

    const data = await response.json();
    return { success: true, data: { links: data.results ?? [] } };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
```

---

## 5. Zod Schemas for External Input

```typescript
// convex/services/schemas.ts

import { z } from "zod";

export const MinMaxAnalysisSchema = z.object({
  category: z.string(),
  level: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  filePath: z.string().optional(),
  fix: z.string().optional(),
});

export const MinMaxResponseSchema = z.object({
  analyses: z.array(MinMaxAnalysisSchema),
});

export const RetrvrLinkSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string(),
});

export type MinMaxAnalysis = z.infer<typeof MinMaxAnalysisSchema>;
export type RetrvrLink = z.infer<typeof RetrvrLinkSchema>;
```

MUST validate all external API responses with Zod before using.

---

## 6. Audit Service (Orchestration)

```typescript
// convex/services/auditService.ts

import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { fetchRepoContents } from "../clients/github";
import { runSecurityAnalysis } from "../clients/minmax";
import { searchRelatedHacks } from "../clients/retrvr";

// Result type for actions
type AuditResult =
  | { success: true; data: { analysisCount: number; probability: number } }
  | { success: false; error: { code: string; message: string } };

export const runAudit = action({
  args: { auditId: v.id("audits") },
  handler: async (ctx, { auditId }): Promise<AuditResult> => {
    // 1. Get audit details
    const audit = await ctx.runQuery(internal.audits.getInternal, { auditId });
    if (!audit) {
      return { success: false, error: { code: "NOT_FOUND", message: "Audit not found" } };
    }

    // 2. Update status to analyzing
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "analyzing",
    });

    // 3. Fetch repo contents
    const repoResult = await fetchRepoContents(audit.repoUrl);
    if (!repoResult.success) {
      await ctx.runMutation(internal.audits.updateStatus, {
        auditId,
        status: "failed",
      });
      return { success: false, error: repoResult.error };
    }

    // 4. Run MinMax analysis
    const repoContents = repoResult.data
      .map((f) => `// ${f.path}\n${f.content}`)
      .join("\n\n");

    const analysisResult = await runSecurityAnalysis(repoContents);
    if (!analysisResult.success) {
      await ctx.runMutation(internal.audits.updateStatus, {
        auditId,
        status: "failed",
      });
      return { success: false, error: analysisResult.error };
    }

    // 5. Store analyses (with optional Retrvr enrichment)
    for (const analysis of analysisResult.data.analyses) {
      // Optional: Enrich with related hack links
      const linksResult = await searchRelatedHacks(analysis.title);
      const links = linksResult.success ? linksResult.data.links.map((l) => l.url) : [];

      await ctx.runMutation(internal.analyses.create, {
        auditId,
        category: analysis.category,
        level: analysis.level,
        title: analysis.title,
        description: analysis.description,
        filePath: analysis.filePath,
        fix: analysis.fix,
        links,
      });
    }

    // 6. Update status to evaluating
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "evaluating",
    });

    // 7. Generate evaluation (probability score)
    const probability = calculateSafetyProbability(analysisResult.data.analyses);
    const summary = generateExecutiveSummary(analysisResult.data.analyses);

    await ctx.runMutation(internal.evaluations.create, {
      auditId,
      probability,
      executiveSummary: summary,
    });

    // 8. Mark complete
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId,
      status: "complete",
    });

    return {
      success: true,
      data: {
        analysisCount: analysisResult.data.analyses.length,
        probability,
      },
    };
  },
});

// Pure functions for scoring
function calculateSafetyProbability(analyses: { level: string }[]): number {
  if (analyses.length === 0) return 100;

  const weights = { critical: 40, high: 25, medium: 10, low: 5 };
  const totalPenalty = analyses.reduce(
    (sum, a) => sum + (weights[a.level as keyof typeof weights] ?? 0),
    0
  );

  return Math.max(0, 100 - totalPenalty);
}

function generateExecutiveSummary(analyses: { level: string; title: string }[]): string {
  const critical = analyses.filter((a) => a.level === "critical").length;
  const high = analyses.filter((a) => a.level === "high").length;

  if (critical > 0) {
    return `${critical} critical and ${high} high severity vulnerabilities found. Deployment unsafe.`;
  }
  if (high > 0) {
    return `${high} high severity vulnerabilities found. Review recommended before deployment.`;
  }
  if (analyses.length > 0) {
    return `${analyses.length} low/medium issues found. Generally safe for deployment with minor fixes.`;
  }
  return "No vulnerabilities detected. Safe for deployment.";
}
```

---

## 7. Error Codes

| Code | Source | Meaning |
|------|--------|---------|
| `INVALID_URL` | GitHub | URL doesn't match github.com pattern |
| `NOT_FOUND` | GitHub | Repository doesn't exist or is private |
| `GITHUB_ERROR` | GitHub | Other GitHub API error |
| `RATE_LIMIT` | MinMax/Retrvr | API quota exceeded |
| `MINMAX_ERROR` | MinMax | Agent API failure |
| `RETRVR_ERROR` | Retrvr | Search API failure |
| `INVALID_RESPONSE` | Any | Response failed Zod validation |
| `NETWORK_ERROR` | Any | Fetch failed |

---

## 8. Environment Variables

```bash
# .env.local (for Convex)
GITHUB_TOKEN=ghp_xxxx          # Optional: higher rate limits
MINMAX_API_KEY=sk-xxxx         # Required
RETRVR_API_KEY=sk-xxxx         # Required
```

MUST NOT commit secrets. MUST use Convex environment variables in production.

---

## 9. Operational Rules

- Clients MUST return structured results (`{ success, data } | { success, error }`)
- Clients MUST NOT throw exceptions
- Clients MUST validate external responses with Zod
- Actions MUST update audit status on failure
- Actions MUST handle partial success gracefully
- MUST NOT block on optional enrichment (Retrvr failure shouldn't fail audit)
- SHOULD log errors server-side for debugging

---

## 10. Testing

### 10.1 Client Tests

Mock `fetch` and test all paths:

```typescript
import { vi, test, expect } from "vitest";
import { fetchRepoContents } from "./github";

test("returns INVALID_URL for malformed URL", async () => {
  const result = await fetchRepoContents("not-a-github-url");

  expect(result.success).toBe(false);
  expect(result.error.code).toBe("INVALID_URL");
});

test("returns NOT_FOUND for 404", async () => {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(null, { status: 404 })
  );

  const result = await fetchRepoContents("https://github.com/fake/repo");

  expect(result.success).toBe(false);
  expect(result.error.code).toBe("NOT_FOUND");
});
```

### 10.2 Service Integration Tests

Use `convex-test` with mocked clients:

```typescript
import { convexTest } from "convex-test";
import { vi, test, expect } from "vitest";
import * as github from "../clients/github";
import * as minmax from "../clients/minmax";

test("runAudit completes successfully", async () => {
  vi.spyOn(github, "fetchRepoContents").mockResolvedValue({
    success: true,
    data: [{ path: "index.ts", content: "console.log('hello')" }],
  });

  vi.spyOn(minmax, "runSecurityAnalysis").mockResolvedValue({
    success: true,
    data: { analyses: [] },
  });

  const t = convexTest(schema);
  const auditId = await t.mutation(api.audits.create, {
    repoUrl: "https://github.com/test/repo",
    commitHash: "abc123",
  });

  const result = await t.action(api.services.auditService.runAudit, { auditId });

  expect(result.success).toBe(true);
  expect(result.data.probability).toBe(100);
});
```

---

## 11. Future Enhancements

If Vibesafe grows:

1. **Retry logic** — Add exponential backoff for transient failures
2. **Queue system** — Use Convex scheduled functions for long-running audits
3. **Streaming** — Stream analyses to frontend as they're generated
4. **Caching** — Cache GitHub file contents to avoid re-fetching

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial services doctrine for Vibesafe |
