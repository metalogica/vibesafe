# Services Doctrine (Convex Actions + External APIs)

**Version**: 1.2.0
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
|  |               startAuditAction                        |   |
|  |   (unified: ingest + analyze + evaluate)              |   |
|  +-----+----------------------------+-------------------+   |
|        |                            |                         |
|        v                            v                         |
|  +--------------+           +--------------+                  |
|  |   GitHub     |           |   Claude     |                  |
|  |   Client     |           |   Client     |                  |
|  +--------------+           +--------------+                  |
|        |                            |                         |
|        v                            v                         |
|  +---------------------------------------------+             |
|  |           src/domain/audit/                  |             |
|  |   Pure functions (filter, sanitize, score)   |             |
|  +---------------------------------------------+             |
|                                                               |
+---------------------------------------------------------------+
```

---

## 3. Directory Structure

```
convex/
├── services/
│   ├── startAuditAction.ts  # Unified ingest + analyze + evaluate action
│   ├── auditService.ts      # Legacy analysis-only action
│   └── schemas.ts           # Zod schemas for external responses
│
├── clients/
│   ├── github.ts            # GitHub REST API client (uses normalizeGitHubError)
│   └── claude.ts            # Anthropic Messages API client
│
└── _generated/

src/domain/audit/                  # Pure functions used by actions
├── fileFilter.ts                  # Ingestion file inclusion rules
├── tokenEstimator.ts              # Token budget + file priority
├── evaluator.ts                   # Safety scoring + display formatting
├── actionBudget.ts                # Wall-clock budget guard
├── normalizeGitHubError.ts        # GitHub error classification
└── sanitizeVulnerabilities.ts     # Post-Zod sanitization
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

import { normalizeGitHubError } from "../../src/domain/audit/normalizeGitHubError";

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
      // Centralised error classification (handles 404, 429, 403+exhausted, 403+private)
      const errorInfo = normalizeGitHubError(response.status, {
        rateLimitRemaining: response.headers.get("X-RateLimit-Remaining"),
        rateLimitReset: response.headers.get("X-RateLimit-Reset"),
      });
      return { success: false, error: errorInfo };
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
      // CRITICAL: must use normalizeGitHubError here too — otherwise rate limits
      // during blob fetching are classified as GITHUB_ERROR and silently skipped
      const errorInfo = normalizeGitHubError(response.status, {
        rateLimitRemaining: response.headers.get("X-RateLimit-Remaining"),
        rateLimitReset: response.headers.get("X-RateLimit-Reset"),
      });
      return { success: false, error: errorInfo };
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
  impact: z.string().optional(),
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

## 6. Unified Audit Action (Orchestration)

The `startAuditAction` is the primary entry point. It combines ingestion, analysis, and evaluation in a single action with three FMEA mitigations:

```typescript
// convex/services/startAuditAction.ts

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { isOverBudget, MAX_BLOB_FETCHES } from "../../src/domain/audit/actionBudget";
import { shouldIncludeFile } from "../../src/domain/audit/fileFilter";
import { sanitizeVulnerabilities } from "../../src/domain/audit/sanitizeVulnerabilities";
import { calculateSafetyProbability, generateExecutiveSummary } from "../../src/domain/audit/evaluator";

export const startAudit = internalAction({
  args: { auditId: v.id("audits"), owner: v.string(), repo: v.string() },
  handler: async (ctx, { auditId, owner, repo }) => {
    const actionStart = Date.now(); // FMEA #1: wall-clock budget

    // FMEA #1: try/catch guarantees terminal state (complete or failed)
    try {
      // === INGESTION: fetch tree, filter files, fetch blobs ===
      // Triple-bounded: wall-clock, file cap (MAX_BLOB_FETCHES), token budget
      // FMEA #2: blob loop propagates RATE_LIMIT errors instead of skipping

      // === ANALYSIS: call Claude, Zod-validate response ===
      // FMEA #3: sanitizeVulnerabilities() post-Zod (clamp lengths, enforce enums, cap count)

      // === EVALUATION: score + summary ===
      // Pure functions from src/domain/audit/evaluator.ts
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected internal error";
      await ctx.runMutation(internal.audits.fail, { auditId, error: message });
    }
  },
});
```

### 6.1 FMEA Mitigations (Mandatory Patterns)

| # | Risk | Mitigation | Implementation |
|---|------|------------|----------------|
| 1 | Action exceeds Convex 10-min limit | Wall-clock budget (`ACTION_BUDGET_MS = 540s`), file cap, try/catch envelope | `src/domain/audit/actionBudget.ts` |
| 2 | GitHub rate limit classified as generic error | Centralised `normalizeGitHubError` used by both `fetchRepoTree` and `fetchBlob` | `src/domain/audit/normalizeGitHubError.ts` |
| 3 | Claude returns valid JSON with bad semantics | Post-Zod sanitiser: clamp field lengths, enforce severity enum, cap at 50 vulns | `src/domain/audit/sanitizeVulnerabilities.ts` |

These mitigations are MANDATORY for any new action that calls external APIs or processes untrusted input.

---

## 7. Error Codes

| Code | Source | Meaning |
|------|--------|---------|
| `INVALID_URL` | URL parsing | URL doesn't match github.com pattern |
| `NOT_FOUND` | GitHub/Convex | Entity doesn't exist |
| `PRIVATE_REPO` | GitHub | 403 without rate limit exhaustion |
| `RATE_LIMIT` | GitHub/Claude | API quota exceeded (429 or 403+exhausted) |
| `GITHUB_ERROR` | GitHub | Other GitHub API error |
| `CLAUDE_ERROR` | Claude | Anthropic API failure |
| `INVALID_RESPONSE` | Claude | Response failed Zod validation |
| `NETWORK_ERROR` | Any | Fetch failed |
| `BUDGET_EXCEEDED` | Action | Wall-clock time or file cap exceeded |

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
- Clients MUST use `normalizeGitHubError` for GitHub error classification (not inline logic)
- Actions MUST wrap entire pipeline in try/catch to guarantee terminal state
- Actions MUST check `isOverBudget()` at every loop iteration and phase boundary
- Actions MUST apply `sanitizeVulnerabilities()` after Zod parse, before database insertion
- Actions MUST propagate RATE_LIMIT errors immediately (not skip with `continue`)
- Actions MUST update audit status on failure
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

1. **CVE enrichment** — Search for related CVEs/hacks per vulnerability
2. **Retry logic** — Add exponential backoff for transient GitHub/Claude failures
3. **Chunked analysis** — Split large repos across multiple Claude calls
4. **Caching** — Cache GitHub file contents to avoid re-fetching on re-audit
5. **Fix verification** — Re-audit after fixes are applied, compare results

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial services doctrine for Vibesafe |
| 1.2.0 | 2026-02-21 | Unified startAuditAction (ingest+analyze+evaluate), FMEA mitigations (action budget, normalizeGitHubError, sanitizeVulnerabilities), domain pure function imports, impact field in Zod schema |
| 1.1.0 | 2026-02-21 | Replace MinMax/Retrvr with Anthropic Claude API; update all client patterns, schemas, error codes, env vars, and test examples to match implementation |
