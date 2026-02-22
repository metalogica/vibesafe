# Ingest Protocol

**Version**: 1.1.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Overview

This protocol defines how Vibesafe ingests GitHub repositories for security analysis. Users paste a public GitHub URL, the server fetches source code using a server-side token, and the content is prepared for security audit.

**Note**: Ingestion is now part of the unified `startAuditAction` (not a separate action). Pure functions live in `src/domain/audit/`.

---

## 2. User Story

```
As a user,
I paste a public GitHub repo URL,
So that Vibesafe can analyze it for security vulnerabilities.

As a user,
I push new code and click "audit" again,
So that I can see if my fixes resolved the issues.
```

---

## 3. Ingest Flow

Ingestion runs as the first phase of `startAuditAction`. All error classification uses `normalizeGitHubError`.

```
┌─────────────────┐
│  User pastes    │
│  GitHub URL     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validate URL   │──── Invalid ────► Error: "Invalid GitHub URL"
│  (parseGitHubUrl│         (mutation throws INVALID_URL)
│   from domain)  │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│  createAndStart │  Mutation creates audit (status=pending,
│  mutation       │  no commitHash), schedules startAudit action
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  status = fetching  │  INGESTION agent event: "Fetching repository..."
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│  Fetch Tree     │──── Error ────► normalizeGitHubError classifies:
│  (GitHub API)   │                  404 → NOT_FOUND
│                 │                  429 → RATE_LIMIT
└────────┬────────┘                  403+exhausted → RATE_LIMIT
         │ Success                   403+remaining → PRIVATE_REPO
         ▼
┌─────────────────┐
│  Filter files   │  shouldIncludeFile from src/domain/audit/fileFilter.ts
│  (source only)  │──── 0 files ────► Error: "No source code files found"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Sort by        │  getFilePriority from src/domain/audit/tokenEstimator.ts
│  security       │  Priority 1 (critical) → 2 (high) → 3 (normal)
│  priority       │
└────────┬────────┘
         │
         ▼
┌───────────────────────────────┐
│  Fetch blobs (triple-bounded) │
│  Gate 1: isOverBudget()       │──── Budget exceeded ────► truncated = true
│  Gate 2: files >= 500 cap     │──── Rate limit ────► FAIL (not skip!)
│  Gate 3: tokens > 200k        │
└────────┬──────────────────────┘
         │
         ▼
┌─────────────────┐
│  Store ingest   │  commitHash, truncated, stats
│  stats on audit │  INGESTION agent event: "Ingestion complete..."
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Continue to    │
│  analysis phase │
└─────────────────┘
```

---

## 4. URL Validation

### 4.1 Accepted Formats

```
https://github.com/{owner}/{repo}
https://github.com/{owner}/{repo}/
https://github.com/{owner}/{repo}.git
https://github.com/{owner}/{repo}/tree/{branch}
https://github.com/{owner}/{repo}/tree/{commit}
```

### 4.2 Validation

**File: `src/domain/audit/parseGitHubUrl.ts`** (pure function, shared by Convex mutation and frontend)

```typescript
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, '');
  const match = cleaned.match(GITHUB_URL_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

Used in the `createAndStart` mutation to validate + normalize the URL before creating the audit record.

### 4.3 Validation Errors

| Input | Error |
|-------|-------|
| Empty string | "Please enter a GitHub URL" |
| Non-GitHub URL | "Please enter a valid GitHub URL" |
| Malformed path | "Could not parse repository from URL" |

---

## 5. GitHub API Strategy

### 5.1 Authentication

All requests use server-side GitHub token for 5,000 req/hr rate limit.

```typescript
const headers = {
  Accept: "application/vnd.github.v3+json",
  Authorization: `Bearer ${process.env.GITHUB_API_KEY}`,
};
```

### 5.2 Fetch Sequence

**Step 1: Get recursive tree**

```
GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
```

Response includes:
- `sha`: commit hash of resolved tree
- `tree[]`: flat list of all files with paths and blob SHAs

**Step 2: Fetch file contents**

For each file passing filter:
```
GET /repos/{owner}/{repo}/git/blobs/{sha}
```

Response includes:
- `content`: base64-encoded file content
- `size`: file size in bytes

### 5.3 Error Classification (FMEA #2)

Both `fetchRepoTree` and `fetchBlob` use `normalizeGitHubError` from `src/domain/audit/normalizeGitHubError.ts` for centralised error classification:

```typescript
const errorInfo = normalizeGitHubError(response.status, {
  rateLimitRemaining: response.headers.get("X-RateLimit-Remaining"),
  rateLimitReset: response.headers.get("X-RateLimit-Reset"),
});
```

| Status | Headers | Error Code |
|--------|---------|------------|
| 404 | any | `NOT_FOUND` |
| 429 | any | `RATE_LIMIT` (with minutes until reset) |
| 403 | `rateLimitRemaining: '0'` | `RATE_LIMIT` |
| 403 | remaining quota > 0 | `PRIVATE_REPO` |
| other | any | `GITHUB_ERROR` |

**Critical**: `fetchBlob` MUST use `normalizeGitHubError` (not a generic error). Otherwise rate limits during blob fetching are misclassified as `GITHUB_ERROR` and silently skipped by the action's `continue`.

---

## 6. File Filtering

### 6.1 Inclusion Rules (Source Code)

**Allowed extensions:**
```
.ts, .tsx, .js, .jsx, .mjs, .cjs
.py, .go, .rs, .rb, .php, .java, .kt, .swift
.json, .yaml, .yml, .toml
.env.example, .env.sample, .env.template
.sql, .prisma, .graphql
.sh, .bash
Dockerfile, docker-compose.yml
```

**Allowed filenames (no extension):**
```
Dockerfile, Makefile, Procfile
```

### 6.2 Exclusion Rules (Always Skip)

**Directories:**
```
node_modules/
vendor/
.git/
dist/
build/
out/
.next/
__pycache__/
.venv/
coverage/
```

**Files:**
```
*.min.js, *.min.css
*.map
*.lock
package-lock.json, yarn.lock, pnpm-lock.yaml
*.png, *.jpg, *.jpeg, *.gif, *.svg, *.ico, *.webp
*.woff, *.woff2, *.ttf, *.eot
*.pdf, *.zip, *.tar, *.gz
```

### 6.3 Filter Implementation

**File: `src/domain/audit/fileFilter.ts`** (pure function, imported by `startAuditAction`)

```typescript
export function shouldIncludeFile(path: string): boolean {
  // Check exclusion directories
  const excludeDirs = ['node_modules/', 'vendor/', '.git/', 'dist/', 'build/', 'out/', '.next/', '__pycache__/', '.venv/', 'coverage/'];
  if (excludeDirs.some(dir => path.includes(dir))) return false;

  // Check exclusion patterns
  const excludePatterns = [/\.min\.(js|css)$/, /\.map$/, /\.lock$/, /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/];
  if (excludePatterns.some(p => p.test(path))) return false;

  // Check binary extensions
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz'];
  if (binaryExts.some(ext => path.endsWith(ext))) return false;

  // Check allowed extensions
  const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.php', '.java', '.kt', '.swift', '.json', '.yaml', '.yml', '.toml', '.sql', '.prisma', '.graphql', '.sh', '.bash'];
  const allowedNames = ['Dockerfile', 'Makefile', 'Procfile', 'docker-compose.yml', '.env.example', '.env.sample', '.env.template'];

  const fileName = path.split('/').pop() ?? '';
  if (allowedNames.includes(fileName)) return true;
  if (allowedExts.some(ext => path.endsWith(ext))) return true;

  return false;
}
```

---

## 7. Token Management

### 7.1 Token Counting

**File: `src/domain/audit/tokenEstimator.ts`** (pure functions)

```typescript
export const TOKEN_LIMIT = 200_000;

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export function getFilePriority(path: string): 1 | 2 | 3 { ... }
```

### 7.2 Token Cap

**Limit:** 200,000 tokens (`TOKEN_LIMIT` constant)

### 7.3 Prioritization (When Truncating)

Files are sorted by security relevance before truncation:

**Priority 1 (Critical):** Files containing these in path:
```
auth, session, login, password, token, secret, credential,
api/, routes/, middleware/, webhook, payment, stripe,
.env, config, security
```

**Priority 2 (High):** Entry points:
```
index.*, app.*, main.*, server.*, handler.*
```

**Priority 3 (Normal):** All other source files.

Within each priority: alphabetical by path.

### 7.4 Triple-Bounded Blob Fetching (FMEA #1)

The blob fetch loop is bounded by three independent limits, checked at every iteration:

```typescript
// src/domain/audit/actionBudget.ts
export const ACTION_BUDGET_MS = 540_000;  // 9 min (1 min headroom before Convex 10-min limit)
export const MAX_BLOB_FETCHES = 500;      // Hard cap on file count

export function isOverBudget(startTime: number): boolean {
  return Date.now() - startTime >= ACTION_BUDGET_MS;
}
```

**In the action's blob loop:**
1. **Wall-clock budget**: `isOverBudget(actionStart)` → break, set `truncated = true`
2. **File cap**: `files.length >= MAX_BLOB_FETCHES` → break, set `truncated = true`
3. **Token budget**: `totalTokens + tokens > TOKEN_LIMIT` → break, set `truncated = true`

**Critical**: If a blob fetch returns `RATE_LIMIT` error, the action MUST fail immediately (not `continue` to next file). Other non-rate-limit errors (e.g., 404 for single file) may be skipped.

### 7.5 Truncation Behavior

Truncation stats are stored on the audit record via `updateIngestStats` mutation:

```typescript
// Stored on audit record
commitHash: string;       // From tree response
truncated: boolean;       // True if any budget was reached
stats: {
  totalFiles: number;     // Files matching filter (before fetch)
  includedFiles: number;  // Files successfully fetched
  totalTokens: number;    // Estimated total (approx)
  includedTokens: number; // Actual tokens fetched
};
```

If truncated:
- `truncated: true` on audit record
- INGESTION agent event: "{includedFiles}/{totalFiles} files loaded (budget reached)"
- UI shows truncation warning

---

## 8. Data Model

### 8.1 Audit Record

```typescript
// convex/schema.ts
audits: defineTable({
  repoUrl: v.string(),                    // Normalized: https://github.com/{owner}/{repo}
  repoOwner: v.string(),                  // Parsed owner
  repoName: v.string(),                   // Parsed repo name
  commitHash: v.optional(v.string()),     // Set after GitHub fetch (not at creation)
  status: v.union(
    v.literal("pending"),
    v.literal("fetching"),
    v.literal("analyzing"),
    v.literal("evaluating"),
    v.literal("complete"),
    v.literal("failed")
  ),
  truncated: v.optional(v.boolean()),
  error: v.optional(v.string()),          // Error message if failed
})
  .index("by_url", ["repoUrl"]),
```

**Key change**: `commitHash` is now `v.optional(v.string())`. It is NOT known at audit creation time — it is set after the GitHub tree fetch via `updateIngestStats` mutation.

### 8.2 Audit History Query

```typescript
// Get all audits for a repo with evaluation data, newest first
export const listByRepoWithEvaluation = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    const audits = await ctx.db
      .query("audits")
      .withIndex("by_url", (q) => q.eq("repoUrl", repoUrl))
      .order("desc")
      .collect();

    return await Promise.all(
      audits.map(async (audit) => {
        const evaluation = await ctx.db
          .query("audit_evaluations")
          .withIndex("by_audit", (q) => q.eq("auditId", audit._id))
          .first();
        return { ...audit, evaluation };
      }),
    );
  },
});
```

This joined query powers the Audit History panel and DeploymentSafetyChart. The `vulnerabilityCount` field on evaluations avoids N+1 queries for chart data.

---

## 9. Error Taxonomy

All error codes are produced by `normalizeGitHubError` (except `INVALID_URL` and `EMPTY_REPO`):

| Error Code | Cause | User Message |
|------------|-------|--------------|
| `INVALID_URL` | URL doesn't match GitHub pattern | "Please enter a valid GitHub URL" |
| `NOT_FOUND` | GitHub returns 404 | "Repository not found" |
| `PRIVATE_REPO` | GitHub returns 403 (not rate limit) | "Repository is private or inaccessible" |
| `RATE_LIMIT` | GitHub returns 429, or 403 with exhausted quota | "GitHub rate limit hit. Try again in {N} minutes." |
| `GITHUB_ERROR` | Other GitHub API error | "GitHub API error: {status}" |
| `NETWORK_ERROR` | fetch() failure | "Network error" |
| `EMPTY_REPO` | No files pass filter | "No source code files found in repository" |
| `BUDGET_EXCEEDED` | Wall-clock or file cap exceeded | "Audit timed out. Try a smaller repository." |

---

## 10. UI States

### 10.1 Input State

```
┌─────────────────────────────────────────────────────────┐
│  🔗  https://github.com/owner/repo          [Start Audit] │
└─────────────────────────────────────────────────────────┘
```

- Button disabled if input empty
- Button disabled while audit in progress
- Show inline error below input on validation failure

### 10.2 Progress States

| Status | UI |
|--------|-----|
| `pending` | "Starting audit..." |
| `fetching` | "Fetching repository..." |
| `analyzing` | "Analyzing code..." (show feed) |
| `evaluating` | "Generating report..." |
| `complete` | Show results |
| `failed` | Show error message |

### 10.3 Truncation Warning

If `truncated: true`:
```
⚠️ Partial audit: 342/1,203 files analyzed
Large repository — some files were skipped. Critical security files were prioritized.
```

---

## 11. Audit History View

### 11.1 Timeline Display

Group audits by repo, show commit hash and timestamp:

```
Repository: github.com/metalogica/crypto-chain

┌──────────────────────────────────────────────────┐
│  uf512x9  •  Feb 21, 2026 2:25 PM  •  12% Safe   │  ← Current
├──────────────────────────────────────────────────┤
│  a3f8c21  •  Feb 20, 2026 4:12 PM  •  8% Safe    │
├──────────────────────────────────────────────────┤
│  bc91e47  •  Feb 19, 2026 11:30 AM •  5% Safe    │
└──────────────────────────────────────────────────┘
```

### 11.2 Commit Comparison

User can click any historical audit to view that snapshot. UI shows "Viewing Commit: {hash}" as in your screenshot.

---

## 12. Sequence Diagram

```
User                    Frontend                   Convex                      GitHub API
 │                         │                            │                         │
 │  paste URL, click       │                            │                         │
 │  [Start Audit]          │                            │                         │
 │────────────────────────►│                            │                         │
 │                         │                            │                         │
 │                         │  mutation:                 │                         │
 │                         │  createAndStart            │                         │
 │                         │───────────────────────────►│                         │
 │                         │                            │                         │
 │                         │  { auditId }               │  schedules              │
 │                         │◄───────────────────────────│  startAudit action      │
 │                         │                            │                         │
 │  subscribe to audit,    │                            │                         │
 │  events, analyses,      │                            │                         │
 │  evaluation             │                            │                         │
 │                         │                            │                         │
 │                         │                            │  status = fetching      │
 │                         │                            │  INGESTION event        │
 │  real-time: "Fetching   │◄───────────────────────────│                         │
 │  repository..."         │                            │                         │
 │                         │                            │  GET /repos/.../trees   │
 │                         │                            │────────────────────────►│
 │                         │                            │                         │
 │                         │                            │  tree + commit SHA      │
 │                         │                            │◄────────────────────────│
 │                         │                            │                         │
 │                         │                            │  INGESTION event:       │
 │  real-time: "Found N    │◄───────────────────────────│  "Found N files..."     │
 │  source files..."       │                            │                         │
 │                         │                            │  GET /blobs (bounded)   │
 │                         │                            │────────────────────────►│
 │                         │                            │   (budget checks at     │
 │                         │                            │    every iteration)     │
 │                         │                            │◄────────────────────────│
 │                         │                            │                         │
 │                         │                            │  updateIngestStats      │
 │                         │                            │  (commitHash, truncated)│
 │                         │                            │                         │
 │                         │                            │  → continues to         │
 │                         │                            │    analysis phase...    │
```

---

## 13. Testing

### 13.1 Unit Tests (in `test/unit/domain/audit/`)

All pure functions have dedicated test files:

| Test File | Key Cases |
|-----------|-----------|
| `parseGitHubUrl.test.ts` | Valid URLs, .git suffix, branch paths, non-GitHub URLs, empty string |
| `fileFilter.test.ts` | Source files pass, node_modules excluded, binaries excluded, Dockerfile passes |
| `tokenEstimator.test.ts` | Token estimation, priority 1/2/3 classification |
| `actionBudget.test.ts` | `isOverBudget` false for recent, true for expired, true at exact boundary |
| `normalizeGitHubError.test.ts` | 404→NOT_FOUND, 429→RATE_LIMIT, 403+exhausted→RATE_LIMIT, 403+remaining→PRIVATE_REPO |

### 13.2 Integration Tests

| Test | Setup | Expected |
|------|-------|----------|
| Happy path | Valid public repo | Audit created, files fetched, continues to analysis |
| Repo not found | Non-existent repo | Audit failed, error = NOT_FOUND |
| Empty repo | Repo with no source files | Audit failed, error stored |
| Large repo | Repo > 200k tokens | truncated = true, proceeds with partial files |
| Rate limit during blob fetch | GitHub 429 mid-fetch | Audit failed, error = RATE_LIMIT (not silently skipped) |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-21 | Unified action model: ingestion now part of startAuditAction; domain pure functions in src/domain/audit/; FMEA mitigations (action budget, normalizeGitHubError, triple-bounded blob loop); optional commitHash; env var GITHUB_API_KEY |
| 1.0.0 | 2026-02-21 | Initial ingest protocol |
