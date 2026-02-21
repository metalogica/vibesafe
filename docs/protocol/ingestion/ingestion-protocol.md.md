# Ingest Protocol

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Overview

This protocol defines how Vibesafe ingests GitHub repositories for security analysis. Users paste a public GitHub URL, the server fetches source code using a server-side token, and the content is prepared for multi-agent audit.

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

```
┌─────────────────┐
│  User pastes    │
│  GitHub URL     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validate URL   │──── Invalid ────► Error: "Invalid GitHub URL"
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│  Create Audit   │
│  status=pending │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch Tree     │──── 404 ────► Error: "Repo not found"
│  (GitHub API)   │──── 403 ────► Error: "Private repo" or "Rate limit"
└────────┬────────┘
         │ Success
         ▼
┌─────────────────┐
│  Extract commit │
│  hash from tree │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Filter files   │
│  (source only)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch blobs    │
│  (file contents)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check token    │──── >200k ────► Truncate + warn
│  count          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Store content  │
│  Trigger audit  │
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

### 4.2 Validation Regex

```typescript
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/;

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().replace(/\.git$/, '').match(GITHUB_URL_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

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
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
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

### 5.3 Rate Limit Handling

If response includes `X-RateLimit-Remaining: 0`:
- Extract `X-RateLimit-Reset` (Unix timestamp)
- Calculate minutes until reset
- Return error: "GitHub rate limit hit. Try again in {N} minutes."

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

```typescript
function shouldIncludeFile(path: string): boolean {
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

Use simple approximation: 1 token ≈ 4 characters.

```typescript
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
```

### 7.2 Token Cap

**Limit:** 200,000 tokens

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

### 7.4 Truncation Behavior

```typescript
interface IngestResult {
  files: { path: string; content: string }[];
  commitHash: string;
  truncated: boolean;
  stats: {
    totalFiles: number;
    includedFiles: number;
    totalTokens: number;
    includedTokens: number;
  };
}
```

If truncated:
- `truncated: true`
- UI shows: "Partial audit: {includedFiles}/{totalFiles} files analyzed ({includedTokens}/{totalTokens} tokens)"

---

## 8. Data Model

### 8.1 Audit Record

```typescript
// convex/schema.ts (addition)
audits: defineTable({
  repoUrl: v.string(),           // Original URL pasted by user
  repoOwner: v.string(),         // Parsed owner
  repoName: v.string(),          // Parsed repo name
  commitHash: v.string(),        // SHA from tree response
  status: v.union(
    v.literal("pending"),
    v.literal("fetching"),       // New: fetching from GitHub
    v.literal("analyzing"),
    v.literal("evaluating"),
    v.literal("complete"),
    v.literal("failed")
  ),
  truncated: v.optional(v.boolean()),
  stats: v.optional(v.object({
    totalFiles: v.number(),
    includedFiles: v.number(),
    totalTokens: v.number(),
    includedTokens: v.number(),
  })),
  error: v.optional(v.string()), // Error message if failed
})
  .index("by_repo", ["repoOwner", "repoName"])
  .index("by_url", ["repoUrl"]),
```

### 8.2 Audit History Query

```typescript
// Get all audits for a repo, newest first
export const listByRepo = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    return await ctx.db
      .query("audits")
      .withIndex("by_url", (q) => q.eq("repoUrl", normalizeUrl(repoUrl)))
      .order("desc")
      .collect();
  },
});
```

---

## 9. Error Taxonomy

| Error Code | Cause | User Message |
|------------|-------|--------------|
| `INVALID_URL` | URL doesn't match GitHub pattern | "Please enter a valid GitHub URL" |
| `REPO_NOT_FOUND` | GitHub returns 404 | "Repository not found. Is it public?" |
| `PRIVATE_REPO` | GitHub returns 403 (not rate limit) | "Private repositories are not supported yet" |
| `RATE_LIMIT` | GitHub returns 403 with rate limit headers | "GitHub rate limit hit. Try again in {N} minutes." |
| `EMPTY_REPO` | No files pass filter | "No source code files found in repository" |
| `FETCH_ERROR` | Network failure | "Failed to fetch repository. Please try again." |

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
User                    Frontend                   Convex Action              GitHub API
 │                         │                            │                         │
 │  paste URL, click       │                            │                         │
 │  [Start Audit]          │                            │                         │
 │────────────────────────►│                            │                         │
 │                         │                            │                         │
 │                         │  validate URL              │                         │
 │                         │  (client-side)             │                         │
 │                         │                            │                         │
 │                         │  mutation: createAudit     │                         │
 │                         │───────────────────────────►│                         │
 │                         │                            │                         │
 │                         │  action: runIngest         │                         │
 │                         │───────────────────────────►│                         │
 │                         │                            │                         │
 │                         │                            │  GET /repos/.../trees   │
 │                         │                            │────────────────────────►│
 │                         │                            │                         │
 │                         │                            │  tree + commit SHA      │
 │                         │                            │◄────────────────────────│
 │                         │                            │                         │
 │                         │                            │  GET /blobs (each file) │
 │                         │                            │────────────────────────►│
 │                         │                            │                         │
 │                         │                            │  file contents          │
 │                         │                            │◄────────────────────────│
 │                         │                            │                         │
 │                         │                            │  mutation: updateAudit  │
 │                         │                            │  (store content, hash)  │
 │                         │                            │                         │
 │                         │                            │  trigger auditService   │
 │                         │                            │─────────────────────────│
 │                         │                            │                         │
 │  real-time updates      │◄───────────────────────────│                         │
 │  (subscription)         │                            │                         │
 │                         │                            │                         │
```

---

## 13. Testing

### 13.1 Unit Tests

| Test | Input | Expected |
|------|-------|----------|
| Valid URL parsing | `https://github.com/owner/repo` | `{ owner: "owner", repo: "repo" }` |
| URL with .git | `https://github.com/owner/repo.git` | `{ owner: "owner", repo: "repo" }` |
| URL with branch | `https://github.com/owner/repo/tree/main` | `{ owner: "owner", repo: "repo" }` |
| Invalid URL | `https://gitlab.com/owner/repo` | `null` |
| File filter: include | `src/auth/login.ts` | `true` |
| File filter: exclude | `node_modules/lodash/index.js` | `false` |
| File filter: binary | `public/logo.png` | `false` |
| Token estimate | 4000 chars | ~1000 tokens |

### 13.2 Integration Tests

| Test | Setup | Expected |
|------|-------|----------|
| Happy path | Valid public repo | Audit created, files fetched, status = analyzing |
| Repo not found | Non-existent repo | Audit failed, error = REPO_NOT_FOUND |
| Empty repo | Repo with no source files | Audit failed, error = EMPTY_REPO |
| Large repo | Repo > 200k tokens | Audit created, truncated = true |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial ingest protocol |
