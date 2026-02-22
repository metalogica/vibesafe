# Services Doctrine (Convex Actions + External APIs)

**Version**: 1.1.0
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
+---------------------------------------------------------------+
|                      Convex Actions                           |
+---------------------------------------------------------------+
|                                                               |
|  +-------------------------------------------------------+   |
|  |                   Audit Service                        |   |
|  |            (orchestrates the audit flow)               |   |
|  +---------------------+--------------------------------+   |
|                         |                                     |
|         +---------------+---------------+                     |
|         v                               v                     |
|  +--------------+              +--------------+               |
|  |   GitHub     |              |   Claude     |               |
|  |   Client     |              |   Client     |               |
|  +--------------+              +--------------+               |
|                                                               |
+---------------------------------------------------------------+
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
│   ├── github.ts            # GitHub REST API client
│   └── claude.ts            # Anthropic Messages API client
│
└── _generated/
```

---

## 4. Client Pattern

### 4.1 Result Type Convention

All clients MUST return structured results and MUST NOT throw:

```typescript
type ClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

### 4.2 GitHub Client

```typescript
// convex/clients/github.ts

const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

export interface GitHubBlobResponse {
  content: string;
  encoding: "base64" | "utf-8";
  size: number;
}

type GitHubClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (process.env.GITHUB_API_KEY) {
    headers.Authorization = `Bearer ${process.env.GITHUB_API_KEY}`;
  }
  return headers;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch = "HEAD",
): Promise<GitHubClientResult<GitHubTreeResponse>> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: getHeaders() },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Repository not found" },
        };
      }
      if (response.status === 403) {
        const rateLimitRemaining =
          response.headers.get("X-RateLimit-Remaining");
        if (rateLimitRemaining === "0") {
          const resetTime = response.headers.get("X-RateLimit-Reset");
          const minutes = resetTime
            ? Math.ceil((Number(resetTime) * 1000 - Date.now()) / 60000)
            : 0;
          return {
            success: false,
            error: {
              code: "RATE_LIMIT",
              message: `GitHub rate limit hit. Try again in ${minutes} minutes.`,
            },
          };
        }
        return {
          success: false,
          error: {
            code: "PRIVATE_REPO",
            message: "Repository is private or inaccessible",
          },
        };
      }
      return {
        success: false,
        error: {
          code: "GITHUB_ERROR",
          message: `GitHub API error: ${response.status}`,
        },
      };
    }

    const data = (await response.json()) as GitHubTreeResponse;
    return { success: true, data };
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

export async function fetchBlob(
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubClientResult<GitHubBlobResponse>> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${sha}`,
      { headers: getHeaders() },
    );

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: "GITHUB_ERROR",
          message: `GitHub API error: ${response.status}`,
        },
      };
    }

    const data = (await response.json()) as GitHubBlobResponse;
    return { success: true, data };
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

### 4.3 Claude Client

Uses the Anthropic Messages API for security analysis.

```typescript
// convex/clients/claude.ts

import { z } from "zod";
import {
  ClaudeAnalysisResponseSchema,
  type Vulnerability,
} from "../services/schemas";

const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

type ClaudeClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export async function runSecurityAnalysis(
  files: { path: string; content: string }[],
): Promise<ClaudeClientResult<{ vulnerabilities: Vulnerability[] }>> {
  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.CLAUDE_CODE_API_KEY ?? "",
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
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

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: { code: "RATE_LIMIT", message: "Anthropic rate limit exceeded" },
        };
      }
      return {
        success: false,
        error: { code: "CLAUDE_ERROR", message: `Anthropic API error: ${response.status}` },
      };
    }

    const raw = await response.json();

    // Validate Anthropic response shape
    const anthropicParsed = AnthropicMessageSchema.safeParse(raw);
    if (!anthropicParsed.success) {
      return {
        success: false,
        error: { code: "INVALID_RESPONSE", message: "Invalid Anthropic response shape" },
      };
    }

    const textContent = anthropicParsed.data.content[0]?.text;
    if (!textContent) {
      return {
        success: false,
        error: { code: "INVALID_RESPONSE", message: "Empty response from Claude" },
      };
    }

    // Parse JSON from Claude's text response
    let analysisJson: unknown;
    try {
      analysisJson = JSON.parse(textContent);
    } catch {
      return {
        success: false,
        error: { code: "INVALID_RESPONSE", message: "Claude response is not valid JSON" },
      };
    }

    // Validate analysis structure
    const analysisParsed = ClaudeAnalysisResponseSchema.safeParse(analysisJson);
    if (!analysisParsed.success) {
      return {
        success: false,
        error: { code: "INVALID_RESPONSE", message: analysisParsed.error.message },
      };
    }

    return { success: true, data: analysisParsed.data };
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

// Internal helpers

const AnthropicMessageSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
});

const SECURITY_ANALYST_SYSTEM_PROMPT = `You are an expert security analyst...`;
// Full prompt defined in convex/clients/claude.ts — see implementation.

function buildAnalysisPrompt(files: { path: string; content: string }[]): string {
  const fileContents = files
    .map((f) => `// File: ${f.path}\n${f.content}`)
    .join("\n\n---\n\n");
  return `Analyze the following codebase for security vulnerabilities:\n\n${fileContents}\n\nIdentify all security vulnerabilities and respond with JSON.`;
}
```

---

## 5. Zod Schemas for External Input

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

export const ClaudeAnalysisResponseSchema = z.object({
  vulnerabilities: z.array(VulnerabilitySchema),
});

export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
```

MUST validate all external API responses with Zod before using.

---

## 6. Audit Service (Orchestration)

```typescript
// convex/services/auditService.ts

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { runSecurityAnalysis } from "../clients/claude";

type AuditResult =
  | { success: true; data: { vulnerabilityCount: number; probability: number } }
  | { success: false; error: { code: string; message: string } };

export const runAudit = action({
  args: {
    auditId: v.id("audits"),
    files: v.array(v.object({ path: v.string(), content: v.string() })),
  },
  handler: async (ctx, { auditId, files }): Promise<AuditResult> => {
    // 1. Update status to analyzing
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId, status: "analyzing",
    });

    // 2. Call Claude for security analysis
    const analysisResult = await runSecurityAnalysis(files);
    if (!analysisResult.success) {
      await ctx.runMutation(internal.audits.fail, {
        auditId, error: analysisResult.error.message,
      });
      return { success: false, error: analysisResult.error };
    }

    const vulnerabilities = analysisResult.data.vulnerabilities;

    // 3. Store each vulnerability + create feed event
    for (let i = 0; i < vulnerabilities.length; i++) {
      const vuln = vulnerabilities[i];
      const seqNumber = i + 1;
      const displayId = generateDisplayId(auditId, seqNumber);

      const analysisId = await ctx.runMutation(internal.analyses.create, {
        auditId, seqNumber, displayId,
        category: vuln.category, level: vuln.level,
        title: vuln.title, description: vuln.description,
        filePath: vuln.filePath, fix: vuln.fix,
      });

      await ctx.runMutation(internal.auditEvents.create, {
        auditId, agent: "SECURITY_ANALYST",
        message: generateAnalystMessage(vuln, displayId),
        analysisId,
      });
    }

    // 4. Evaluate + complete
    await ctx.runMutation(internal.audits.updateStatus, {
      auditId, status: "evaluating",
    });

    const probability = calculateSafetyProbability(vulnerabilities);
    const executiveSummary = generateExecutiveSummary(vulnerabilities);

    await ctx.runMutation(internal.evaluations.create, {
      auditId, probability, executiveSummary,
    });

    await ctx.runMutation(internal.auditEvents.create, {
      auditId, agent: "EVALUATOR", message: executiveSummary,
    });

    await ctx.runMutation(internal.audits.updateStatus, {
      auditId, status: "complete",
    });

    return {
      success: true,
      data: { vulnerabilityCount: vulnerabilities.length, probability },
    };
  },
});

// Pure functions: calculateSafetyProbability, generateExecutiveSummary,
// generateDisplayId, generateAnalystMessage — see implementation.
```

---

## 7. Error Codes

| Code | Source | Meaning |
|------|--------|---------|
| `INVALID_URL` | GitHub | URL doesn't match github.com pattern |
| `NOT_FOUND` | GitHub/Convex | Entity doesn't exist |
| `PRIVATE_REPO` | GitHub | 403 without rate limit headers |
| `RATE_LIMIT` | GitHub/Claude | API quota exceeded |
| `GITHUB_ERROR` | GitHub | Other GitHub API error |
| `CLAUDE_ERROR` | Claude | Anthropic API failure |
| `INVALID_RESPONSE` | Claude | Response failed Zod validation |
| `NETWORK_ERROR` | Any | Fetch failed |
| `AGENT_ERROR` | Service | Analysis call failed |

---

## 8. Environment Variables

```bash
# Set in Convex dashboard (server-side, accessed via process.env in actions)
GITHUB_API_KEY=ghp_xxxx          # GitHub personal access token
CLAUDE_CODE_API_KEY=sk-xxxx      # Anthropic API key

# Set in .env.local (client-side, used by Next.js ConvexClientProvider)
NEXT_PUBLIC_CONVEX_URL=https://xxx.convex.cloud
```

MUST NOT commit secrets. MUST use Convex environment variables for server-side keys.

---

## 9. Operational Rules

- Clients MUST return structured results (`{ success, data } | { success, error }`)
- Clients MUST NOT throw exceptions
- Clients MUST validate external responses with Zod
- Actions MUST update audit status on failure
- Actions MUST handle partial success gracefully
- SHOULD log errors server-side for debugging

---

## 10. Testing

### 10.1 Client Tests

Mock `fetch` and test all paths:

```typescript
import { vi, test, expect } from "vitest";
import { fetchRepoTree } from "./github";

test("returns NOT_FOUND for 404", async () => {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(null, { status: 404 })
  );

  const result = await fetchRepoTree("fake", "repo");

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.code).toBe("NOT_FOUND");
  }
});
```

### 10.2 Service Integration Tests

Use `convex-test` with mocked clients:

```typescript
import { convexTest } from "convex-test";
import { vi, test, expect } from "vitest";
import * as claude from "../clients/claude";

test("runAudit completes successfully", async () => {
  vi.spyOn(claude, "runSecurityAnalysis").mockResolvedValue({
    success: true,
    data: { vulnerabilities: [] },
  });

  const t = convexTest(schema);
  const auditId = await t.mutation(api.audits.create, {
    repoUrl: "https://github.com/test/repo",
    repoOwner: "test",
    repoName: "repo",
    commitHash: "abc123",
  });

  const result = await t.action(api.services.auditService.runAudit, {
    auditId,
    files: [{ path: "index.ts", content: "console.log('hello')" }],
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.probability).toBe(100);
  }
});
```

---

## 11. Future Enhancements

If Vibesafe grows:

1. **Retrvr integration** — Search for related CVEs/hacks per vulnerability (enrich `audit_analyses.links`)
2. **Retry logic** — Add exponential backoff for transient failures
3. **Queue system** — Use Convex scheduled functions for long-running audits
4. **Streaming** — Stream analyses to frontend as they're generated
5. **Caching** — Cache GitHub file contents to avoid re-fetching

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial services doctrine for Vibesafe |
| 1.1.0 | 2026-02-21 | Replace MinMax/Retrvr with Anthropic Claude API; update all client patterns, schemas, error codes, env vars, and test examples to match implementation |
