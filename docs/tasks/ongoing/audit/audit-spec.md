# Audit Feature: Technical Specification

**Version**: 1.1.0
**Status**: Draft
**Author**: Architect Agent
**Date**: 2026-02-21
**Parent Docs**: `docs/protocol/ingestion/ingestion-protocol.md.md`, `docs/protocol/audit/audit-protocol.md`

---

## 1. Overview

### 1.1 Objective

Connect the existing Convex backend (schema, mutations, queries, Claude + GitHub clients) to the existing frontend UI (SecurityAuditApp, AgentFeed, VulnerabilitiesPanel, VulnerabilityModal, DeploymentSafetyChart) so that a user can paste a public GitHub URL, trigger an end-to-end ingestion + security audit, and watch results stream in real-time.

### 1.2 Constraints

- MUST follow `docs/protocol/ingestion/ingestion-protocol.md.md` for ingestion flow
- MUST follow `docs/protocol/audit/audit-protocol.md` for audit flow
- SHOULD follow `docs/doctrine/` architectural standards
- AI provider: Claude (Anthropic) via existing `convex/clients/claude.ts`
- Single Convex action combines ingestion + analysis + evaluation

### 1.3 Success Criteria

- `pnpm app:compile` passes (zero TS errors)
- `pnpm app:lint` passes
- `pnpm app:build` succeeds
- `pnpm test:unit:ci` passes with all new tests green

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Schema updates (commitHash optional, impact field, INGESTION agent) | Authentication / user sessions |
| Domain pure functions (URL parsing, file filtering, token estimation, evaluator) | Private repo support |
| Unified `startAudit` Convex action (ingest + analyze + evaluate) | Chunked analysis for very large repos |
| Frontend-Convex wiring (replace mock data with real-time subscriptions) | Audit history comparison / diff views |
| Unit tests for all new pure functions | E2E / integration tests against live APIs |
| VulnerabilityModal `impact` field support | Re-audit / fix verification workflow |

---

## 3. Data Model Changes

### 3.1 Schema Updates

**File: `convex/schema.ts`**

Changes to `audits` table:
```typescript
commitHash: v.optional(v.string()),  // Was: v.string() — now optional, set after GitHub fetch
```

Changes to `audit_analyses` table:
```typescript
impact: v.optional(v.string()),  // NEW — business/security impact statement for modal
```

Changes to `audit_events` table:
```typescript
agent: v.union(
  v.literal('INGESTION'),           // NEW — events during repo fetching
  v.literal('SECURITY_ANALYST'),
  v.literal('EVALUATOR'),
),
```

Changes to `audit_evaluations` table:
```typescript
vulnerabilityCount: v.number(),  // NEW — avoids N+1 queries for chart data
```

### 3.2 Zod Schema Update

**File: `convex/services/schemas.ts`**

```typescript
export const VulnerabilitySchema = z.object({
  category: z.string(),
  level: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
  impact: z.string().optional(),      // NEW
  filePath: z.string().optional(),
  fix: z.string().optional(),
});
```

### 3.3 Claude Prompt Update

**File: `convex/clients/claude.ts`**

Add `impact` to the system prompt's field list:
```
- impact: A concise statement of the business or security impact if exploited (e.g., "Enables unauthorized access to all user payment data")
```

And to the example response:
```json
{
  "impact": "Allows attackers to create checkout sessions for any user, enabling payment fraud and credit theft."
}
```

### 3.4 New Convex Query: Combined Audit History

**File: `convex/audits.ts`** — add new query:

```typescript
export const listByRepoWithEvaluation = query({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    const audits = await ctx.db
      .query('audits')
      .withIndex('by_url', (q) => q.eq('repoUrl', repoUrl))
      .order('desc')
      .collect();

    return await Promise.all(
      audits.map(async (audit) => {
        const evaluation = await ctx.db
          .query('audit_evaluations')
          .withIndex('by_audit', (q) => q.eq('auditId', audit._id))
          .first();
        return { ...audit, evaluation };
      }),
    );
  },
});
```

### 3.5 New Mutation: createAndStart

**File: `convex/audits.ts`** — add new mutation:

```typescript
export const createAndStart = mutation({
  args: { repoUrl: v.string() },
  handler: async (ctx, { repoUrl }) => {
    // 1. Parse + validate URL
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      throw new Error('INVALID_URL');
    }

    // 2. Normalize URL for consistent indexing
    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    // 3. Create audit record
    const auditId = await ctx.db.insert('audits', {
      repoUrl: normalizedUrl,
      repoOwner: parsed.owner,
      repoName: parsed.repo,
      status: 'pending',
    });

    // 4. Schedule the action
    await ctx.scheduler.runAfter(0, internal.services.startAuditAction.startAudit, {
      auditId,
      owner: parsed.owner,
      repo: parsed.repo,
    });

    return { auditId, repoUrl: normalizedUrl };
  },
});
```

---

## 4. Domain Layer (Pure Functions)

All pure functions live in `src/domain/audit/` for testability and shared frontend/backend use.

### 4.1 parseGitHubUrl

**File: `src/domain/audit/parseGitHubUrl.ts`**

```typescript
const GITHUB_URL_REGEX = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/;

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, '');
  const match = cleaned.match(GITHUB_URL_REGEX);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

### 4.2 fileFilter

**File: `src/domain/audit/fileFilter.ts`**

Implements the filtering logic from `docs/protocol/ingestion/ingestion-protocol.md.md` Section 6. Must include:

- `shouldIncludeFile(path: string): boolean`
- Exclusion directories: `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `out/`, `.next/`, `__pycache__/`, `.venv/`, `coverage/`
- Exclusion patterns: `.min.js`, `.min.css`, `.map`, `.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- Binary exclusions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.webp`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.pdf`, `.zip`, `.tar`, `.gz`
- Allowed extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.rs`, `.rb`, `.php`, `.java`, `.kt`, `.swift`, `.json`, `.yaml`, `.yml`, `.toml`, `.sql`, `.prisma`, `.graphql`, `.sh`, `.bash`
- Allowed filenames: `Dockerfile`, `Makefile`, `Procfile`, `docker-compose.yml`, `.env.example`, `.env.sample`, `.env.template`

### 4.3 tokenEstimator

**File: `src/domain/audit/tokenEstimator.ts`**

```typescript
const TOKEN_LIMIT = 200_000;

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export { TOKEN_LIMIT };
```

Also export a file prioritization function per protocol Section 7.3:

```typescript
export function getFilePriority(path: string): 1 | 2 | 3
```

- Priority 1 (Critical): paths containing `auth`, `session`, `login`, `password`, `token`, `secret`, `credential`, `api/`, `routes/`, `middleware/`, `webhook`, `payment`, `stripe`, `.env`, `config`, `security`
- Priority 2 (High): entry points matching `index.*`, `app.*`, `main.*`, `server.*`, `handler.*`
- Priority 3 (Normal): everything else

### 4.4 evaluator

**File: `src/domain/audit/evaluator.ts`**

Extract from `convex/services/auditService.ts`. Export:

```typescript
export const SEVERITY_PENALTIES: Record<string, number> = {
  critical: 40, high: 25, medium: 10, low: 5,
};

export function calculateSafetyProbability(vulnerabilities: { level: string }[]): number
export function generateExecutiveSummary(vulnerabilities: { level: string; category: string }[]): string
export function generateDisplayId(auditId: string, seqNumber: number): string
export function generateAnalystMessage(vuln: { level: string; category: string; title: string; description: string; filePath?: string }, displayId: string): string
```

Logic is identical to what's currently in `convex/services/auditService.ts` lines 8-86.

### 4.5 actionBudget (FMEA #1)

**File: `src/domain/audit/actionBudget.ts`**

Constants and a pure guard function that the action calls at every loop iteration and phase boundary.

```typescript
/** Convex actions have a 10-minute hard limit. Leave 60s headroom. */
export const ACTION_BUDGET_MS = 540_000;

/** Hard cap on blob fetches regardless of token budget. */
export const MAX_BLOB_FETCHES = 500;

/**
 * Returns true when the elapsed wall-clock time exceeds the budget.
 * @param startTime - `Date.now()` captured at action entry
 */
export function isOverBudget(startTime: number): boolean {
  return Date.now() - startTime >= ACTION_BUDGET_MS;
}
```

The action captures `const actionStart = Date.now()` on entry and calls `isOverBudget(actionStart)` at every blob-fetch iteration and before each phase transition. When the budget is exceeded, the action marks the audit as failed with error `BUDGET_EXCEEDED: "Audit timed out. Try a smaller repository."` and returns immediately.

### 4.6 normalizeGitHubError (FMEA #2)

**File: `src/domain/audit/normalizeGitHubError.ts`**

A pure function that classifies a GitHub HTTP response into the application's error taxonomy. This centralises the 403-vs-429-vs-404 logic currently duplicated across `fetchRepoTree` and (missing from) `fetchBlob`.

```typescript
export interface GitHubErrorInfo {
  code: 'NOT_FOUND' | 'RATE_LIMIT' | 'PRIVATE_REPO' | 'GITHUB_ERROR';
  message: string;
}

export function normalizeGitHubError(
  status: number,
  headers: { rateLimitRemaining: string | null; rateLimitReset: string | null },
): GitHubErrorInfo {
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'Repository not found' };
  }

  if (status === 429) {
    const minutes = headers.rateLimitReset
      ? Math.ceil((Number(headers.rateLimitReset) * 1000 - Date.now()) / 60_000)
      : 0;
    return {
      code: 'RATE_LIMIT',
      message: `GitHub rate limit hit. Try again in ${Math.max(minutes, 1)} minutes.`,
    };
  }

  if (status === 403) {
    if (headers.rateLimitRemaining === '0') {
      const minutes = headers.rateLimitReset
        ? Math.ceil((Number(headers.rateLimitReset) * 1000 - Date.now()) / 60_000)
        : 0;
      return {
        code: 'RATE_LIMIT',
        message: `GitHub rate limit hit. Try again in ${Math.max(minutes, 1)} minutes.`,
      };
    }
    return { code: 'PRIVATE_REPO', message: 'Repository is private or inaccessible' };
  }

  return { code: 'GITHUB_ERROR', message: `GitHub API error: ${status}` };
}
```

Both `fetchRepoTree` and `fetchBlob` in `convex/clients/github.ts` should be updated to use this function instead of their inline classification logic. Critically, `fetchBlob` currently returns a generic `GITHUB_ERROR` for *all* non-200 responses — it needs to call `normalizeGitHubError` so that a rate limit during blob fetching is correctly classified as `RATE_LIMIT`, not swallowed by the action's `continue`.

### 4.7 sanitizeVulnerabilities (FMEA #3)

**File: `src/domain/audit/sanitizeVulnerabilities.ts`**

Post-Zod sanitiser layer that clamps field lengths, enforces business rules, and caps the total vulnerability count. Applied after Zod structural validation, before database insertion.

```typescript
/** Maximum counts and field lengths. */
export const SANITIZE_LIMITS = {
  maxVulnerabilities: 50,
  maxTitleLength: 200,
  maxDescriptionLength: 2000,
  maxImpactLength: 1000,
  maxFixLength: 2000,
  maxFilePathLength: 500,
  maxCategoryLength: 100,
} as const;

const VALID_LEVELS = new Set(['low', 'medium', 'high', 'critical']);

export interface SanitizedVulnerability {
  category: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact?: string;
  filePath?: string;
  fix?: string;
}

/**
 * Clamp a string to maxLength. If it exceeds, truncate and append "…".
 */
function clamp(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + '…';
}

/**
 * Sanitise a single vulnerability. Returns null if the entry is
 * irrecoverably invalid (empty title, empty description, or unknown level).
 */
export function sanitizeVulnerability(
  v: Record<string, unknown>,
): SanitizedVulnerability | null {
  const title = clamp(String(v.title ?? ''), SANITIZE_LIMITS.maxTitleLength);
  const description = clamp(String(v.description ?? ''), SANITIZE_LIMITS.maxDescriptionLength);

  // Reject entries missing required human-readable fields
  if (!title || title.length === 0) return null;
  if (!description || description.length === 0) return null;

  const level = String(v.level ?? '');
  if (!VALID_LEVELS.has(level)) return null;

  return {
    category: clamp(String(v.category ?? 'unknown'), SANITIZE_LIMITS.maxCategoryLength)!,
    level: level as SanitizedVulnerability['level'],
    title,
    description,
    impact: clamp(v.impact as string | undefined, SANITIZE_LIMITS.maxImpactLength),
    filePath: clamp(v.filePath as string | undefined, SANITIZE_LIMITS.maxFilePathLength),
    fix: clamp(v.fix as string | undefined, SANITIZE_LIMITS.maxFixLength),
  };
}

/**
 * Sanitise the full array. Drops invalid entries, caps at maxVulnerabilities.
 */
export function sanitizeVulnerabilities(
  raw: Record<string, unknown>[],
): SanitizedVulnerability[] {
  return raw
    .map(sanitizeVulnerability)
    .filter((v): v is SanitizedVulnerability => v !== null)
    .slice(0, SANITIZE_LIMITS.maxVulnerabilities);
}
```

**Integration point**: In both `startAuditAction.ts` and `auditService.ts`, call `sanitizeVulnerabilities()` on the Zod-parsed `vulnerabilities` array *before* the for-loop that inserts records.

---

## 5. Convex Backend

### 5.1 Unified startAudit Action

**File: `convex/services/startAuditAction.ts`**

This is the single Convex action that handles the entire flow: ingestion -> analysis -> evaluation.

```typescript
export const startAudit = internalAction({
  args: {
    auditId: v.id('audits'),
    owner: v.string(),
    repo: v.string(),
  },
  handler: async (ctx, { auditId, owner, repo }) => {
    const actionStart = Date.now(); // FMEA #1: wall-clock budget

    // ── Guarantee: every code path reaches 'complete' or 'failed' ──
    try {
      await runAuditPipeline(ctx, { auditId, owner, repo, actionStart });
    } catch (err) {
      // Belt-and-suspenders: if anything unexpected throws, force terminal state
      const message = err instanceof Error ? err.message : 'Unexpected internal error';
      await ctx.runMutation(internal.audits.fail, { auditId, error: message });
    }
  },
});

async function runAuditPipeline(
  ctx: ActionCtx,
  { auditId, owner, repo, actionStart }: {
    auditId: Id<'audits'>; owner: string; repo: string; actionStart: number;
  },
) {
  // === INGESTION PHASE ===

  // 1. Update status to fetching
  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'fetching' });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: `Fetching repository ${owner}/${repo} from GitHub...`,
  });

  // 2. Fetch tree from GitHub
  const treeResult = await fetchRepoTree(owner, repo);
  if (!treeResult.success) {
    await ctx.runMutation(internal.audits.fail, { auditId, error: treeResult.error.message });
    return;
  }

  const { sha: commitHash, tree } = treeResult.data;

  // 3. Filter files
  const sourceFiles = tree.filter(
    (entry) => entry.type === 'blob' && shouldIncludeFile(entry.path),
  );

  if (sourceFiles.length === 0) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'No source code files found in repository',
    });
    return;
  }

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: `Found ${sourceFiles.length} source files. Fetching contents...`,
  });

  // 4. Sort by security priority
  const sortedFiles = [...sourceFiles].sort((a, b) => {
    const pa = getFilePriority(a.path);
    const pb = getFilePriority(b.path);
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });

  // 5. Fetch blobs — triple-bounded: token budget, file cap, wall-clock (FMEA #1)
  const files: { path: string; content: string }[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const entry of sortedFiles) {
    // Budget gate: wall-clock
    if (isOverBudget(actionStart)) {
      truncated = true;
      break;
    }
    // Budget gate: file cap
    if (files.length >= MAX_BLOB_FETCHES) {
      truncated = true;
      break;
    }

    const blobResult = await fetchBlob(owner, repo, entry.sha);

    // FMEA #2: rate-limit errors must propagate, not be silently skipped
    if (!blobResult.success) {
      if (blobResult.error.code === 'RATE_LIMIT') {
        await ctx.runMutation(internal.audits.fail, {
          auditId, error: blobResult.error.message,
        });
        return;
      }
      // Non-rate-limit blob errors (e.g. 404 for single file) → skip file
      continue;
    }

    const content = Buffer.from(blobResult.data.content, 'base64').toString('utf-8');
    const tokens = estimateTokens(content);

    // Budget gate: token limit
    if (totalTokens + tokens > TOKEN_LIMIT) {
      truncated = true;
      break;
    }

    files.push({ path: entry.path, content });
    totalTokens += tokens;
  }

  // 6. Must have at least 1 file after fetching
  if (files.length === 0) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'Failed to fetch any file contents from repository',
    });
    return;
  }

  // 7. Store ingest stats
  await ctx.runMutation(internal.audits.updateIngestStats, {
    auditId,
    commitHash,
    truncated,
    stats: {
      totalFiles: sourceFiles.length,
      includedFiles: files.length,
      totalTokens: sourceFiles.length * 250,
      includedTokens: totalTokens,
    },
  });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'INGESTION',
    message: truncated
      ? `Ingestion complete. ${files.length}/${sourceFiles.length} files loaded (budget reached). Starting analysis...`
      : `Ingestion complete. ${files.length} files loaded. Starting analysis...`,
  });

  // === ANALYSIS PHASE ===

  // 8. Budget gate before expensive Claude call
  if (isOverBudget(actionStart)) {
    await ctx.runMutation(internal.audits.fail, {
      auditId, error: 'Audit timed out during ingestion. Try a smaller repository.',
    });
    return;
  }

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'analyzing' });

  // 9. Call Claude
  const analysisResult = await runSecurityAnalysis(files);
  if (!analysisResult.success) {
    await ctx.runMutation(internal.audits.fail, { auditId, error: analysisResult.error.message });
    return;
  }

  // 10. FMEA #3: Sanitise vulnerabilities — clamp lengths, enforce enums, cap count
  const vulnerabilities = sanitizeVulnerabilities(
    analysisResult.data.vulnerabilities as Record<string, unknown>[],
  );

  // 11. Store each vulnerability + create feed event
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
      impact: vuln.impact,
      filePath: vuln.filePath,
      fix: vuln.fix,
    });

    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'SECURITY_ANALYST',
      message: generateAnalystMessage(vuln, displayId),
      analysisId,
    });
  }

  // === EVALUATION PHASE ===

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'evaluating' });

  const probability = calculateSafetyProbability(vulnerabilities);
  const executiveSummary = generateExecutiveSummary(vulnerabilities);

  await ctx.runMutation(internal.evaluations.create, {
    auditId,
    probability,
    executiveSummary,
    vulnerabilityCount: vulnerabilities.length,
  });

  await ctx.runMutation(internal.auditEvents.create, {
    auditId,
    agent: 'EVALUATOR',
    message: executiveSummary,
  });

  await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'complete' });
}
```

### 5.2 Updates to Existing Files

**`convex/clients/github.ts`** (FMEA #2): Refactor both `fetchRepoTree` and `fetchBlob` to use `normalizeGitHubError` from `src/domain/audit/normalizeGitHubError.ts` instead of inline error classification. Critically, `fetchBlob` currently returns a generic `GITHUB_ERROR` for every non-200 status — after this change it will correctly return `RATE_LIMIT` for 429/403-with-exhausted-quota, enabling the action's blob loop to propagate rate limits instead of silently skipping. Also add 429 handling (currently missing from both functions).

**`convex/services/auditService.ts`**: Update the `runAudit` action to:
1. Import evaluator functions from `src/domain/audit/evaluator.ts` instead of defining them locally.
2. Pass `impact: vuln.impact` when creating analyses.
3. Apply `sanitizeVulnerabilities()` to the Zod-parsed array before the insert loop (FMEA #3).

The existing `runAudit` action export stays as-is for backward compatibility.

**`convex/analyses.ts`**: Add `impact: v.optional(v.string())` to the `create` mutation args.

**`convex/evaluations.ts`**: Add `vulnerabilityCount: v.number()` to the `create` mutation args.

**`convex/audits.ts`**: Update `create` mutation to make `commitHash` optional. The existing `updateIngestStats` already handles setting commitHash.

---

## 6. Frontend Integration

### 6.1 Type Updates

**File: `src/frontend/types.ts`**

The types stay largely the same but the component will use Convex document types internally. Keep the existing types for component props (they serve as the view model), and create mappers.

Update `AgentRole` to support all backend agent types:
```typescript
export type AgentRole = 'ingestion' | 'security' | 'evaluator';
```

Remove `belief` from `AgentMessage` (no longer used):
```typescript
export interface AgentMessage {
  id: string;
  agent: AgentRole;
  text: string;
  timestamp: number;
}
```

Update `Vulnerability` to align with backend:
```typescript
export interface Vulnerability {
  id: string;          // displayId from audit_analyses
  title: string;
  file: string;        // filePath from audit_analyses
  severity: Severity;  // level from audit_analyses
  category: string;    // category from audit_analyses
  description: string;
  impact: string;      // NEW field from audit_analyses
  fix: string;
}
```

Remove `status` and `commitDetected` from `Vulnerability` (these were mock-only).

### 6.2 Mapper Functions

**File: `src/frontend/lib/auditMappers.ts`**

```typescript
import type { Doc } from '../../convex/_generated/dataModel';
import type { AgentMessage, Vulnerability } from '../types';

export function mapAnalysisToVulnerability(
  analysis: Doc<'audit_analyses'>,
): Vulnerability {
  return {
    id: analysis.displayId,
    title: analysis.title,
    file: analysis.filePath ?? '(architectural)',
    severity: analysis.level,
    category: analysis.category,
    description: analysis.description,
    impact: analysis.impact ?? '',
    fix: analysis.fix ?? '',
  };
}

const AGENT_MAP: Record<string, AgentMessage['agent']> = {
  INGESTION: 'ingestion',
  SECURITY_ANALYST: 'security',
  EVALUATOR: 'evaluator',
};

export function mapEventToMessage(
  event: Doc<'audit_events'>,
): AgentMessage {
  return {
    id: event._id,
    agent: AGENT_MAP[event.agent] ?? 'security',
    text: event.message,
    timestamp: event._creationTime,
  };
}
```

### 6.3 SecurityAuditApp Refactor

**File: `src/frontend/components/SecurityAuditApp.tsx`**

This is the largest change. The component transforms from mock-data-driven to Convex-subscription-driven.

**State model:**
```typescript
// User input
const [repoUrl, setRepoUrl] = useState('');

// Current audit tracking
const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(null);

// UI state
const [vulnFilter, setVulnFilter] = useState<SeverityFilter>('all');
const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
const [isHistoryOpen, setIsHistoryOpen] = useState(false);
const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);

// Error state
const [error, setError] = useState<string | null>(null);
```

**Convex hooks:**
```typescript
// Mutation to start audit
const createAndStart = useMutation(api.audits.createAndStart);

// Real-time subscriptions (skip when no auditId)
const audit = useQuery(api.audits.get, currentAuditId ? { auditId: currentAuditId } : 'skip');
const events = useQuery(api.auditEvents.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
const analyses = useQuery(api.analyses.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
const evaluation = useQuery(api.evaluations.getByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');

// Audit history for this repo
const normalizedUrl = parseGitHubUrl(repoUrl)
  ? `https://github.com/${parseGitHubUrl(repoUrl)!.owner}/${parseGitHubUrl(repoUrl)!.repo}`
  : null;
const history = useQuery(
  api.audits.listByRepoWithEvaluation,
  normalizedUrl ? { repoUrl: normalizedUrl } : 'skip',
);
```

**Derived state:**
```typescript
// Map Convex status to UI status
const uiStatus: AuditStatus = !audit
  ? 'idle'
  : audit.status === 'complete' || audit.status === 'failed'
    ? 'ready'
    : 'auditing';

// Map events to messages
const messages = useMemo(
  () => (events ?? []).map(mapEventToMessage),
  [events],
);

// Map analyses to vulnerabilities
const vulnerabilities = useMemo(
  () => (analyses ?? []).map(mapAnalysisToVulnerability),
  [analyses],
);

// Running probability (updates in real-time as vulns stream in)
const currentConsensus = useMemo(() => {
  if (evaluation) return evaluation.probability;
  if (!analyses || analyses.length === 0) return 100;
  return calculateSafetyProbability(analyses);
}, [analyses, evaluation]);

// Chart data from history
const commits: CommitData[] = useMemo(() => {
  if (!history) return [];
  return history
    .filter((a) => a.status === 'complete' && a.evaluation)
    .reverse()
    .map((a) => ({
      hash: a.commitHash ?? a._id.slice(0, 7),
      consensus: a.evaluation!.probability,
      vulnerabilityCount: a.evaluation!.vulnerabilityCount,
    }));
}, [history]);
```

**Start audit handler:**
```typescript
const handleStartAudit = async () => {
  if (!repoUrl) return;
  setError(null);
  try {
    const result = await createAndStart({ repoUrl });
    setCurrentAuditId(result.auditId);
    setSelectedCommitHash(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to start audit');
  }
};
```

**Remove entirely:**
- All `setInterval`-based mock simulation logic
- `AUDIT_SCENARIO_MESSAGES`, `FIX_SCENARIO_MESSAGES`, `INITIAL_VULNERABILITIES` imports
- `createMessage()` helper
- `simulateNewCommit()` function
- `intervalRef`

### 6.4 AgentFeed Updates

**File: `src/frontend/components/AgentFeed.tsx`**

Update agent display functions to handle the new `'ingestion'` role:

```typescript
function getAgentIcon(agent: string) {
  switch (agent) {
    case 'ingestion': return <FileSearch className="h-4 w-4" />;
    case 'security': return <ShieldAlert className="h-4 w-4" />;
    case 'evaluator': return <Gavel className="h-4 w-4" />;
    default: return <Bot className="h-4 w-4" />;
  }
}
// Same pattern for getAgentColorStyles, getAgentName, getAgentTextColor
// 'ingestion' replaces 'retriever' with same indigo styling
```

### 6.5 VulnerabilityModal Updates

**File: `src/frontend/components/VulnerabilityModal.tsx`**

The modal already renders `vulnerability.impact` (line 161). Now that the `Vulnerability` type includes `impact` from the backend, this will display real data.

Remove references to `vulnerability.status` (open/fixed) and `vulnerability.commitDetected` since these fields are removed from the type. Replace the status badge area with the `vulnerability.category` label. Replace the "Detected In Commit" metadata with the vulnerability `id` (displayId like `SEC-A-001`).

### 6.6 VulnerabilitiesPanel Updates

**File: `src/frontend/components/VulnerabilitiesPanel.tsx`**

Remove the "Apply Fixes & Commit" button (out of scope for v1). The `onApplyFixes` prop is removed. Remove the `isAuditComplete` prop since the button is gone.

---

## 7. Error Handling

| Error | Source | User-Facing Message |
|-------|--------|---------------------|
| `INVALID_URL` | URL parsing | "Please enter a valid GitHub URL" |
| `NOT_FOUND` | GitHub 404 | "Repository not found. Is it public?" |
| `PRIVATE_REPO` | GitHub 403 | "Private repositories are not supported yet" |
| `RATE_LIMIT` | GitHub 403+exhausted / 429 / Claude 429 | "Rate limit hit. Try again in {N} minutes." |
| `EMPTY_REPO` | No files pass filter | "No source code files found in repository" |
| `CLAUDE_ERROR` | Claude API failure | "Analysis failed. Please try again." |
| `INVALID_RESPONSE` | Claude returns malformed JSON | "Analysis returned invalid results. Please try again." |
| `NETWORK_ERROR` | fetch() failure | "Network error. Please check your connection." |
| `BUDGET_EXCEEDED` | Wall-clock or file-cap exceeded (FMEA #1) | "Audit timed out. Try a smaller repository." |

Errors are stored in `audits.error` field. The frontend reads `audit.status === 'failed'` and displays `audit.error`.

**Terminal-state guarantee (FMEA #1)**: The `startAudit` action wraps its entire pipeline in a try/catch. If any unexpected exception escapes the pipeline, the catch block calls `audits.fail` with the error message. This guarantees every audit reaches `complete` or `failed` — never stuck in `pending`/`fetching`/`analyzing`/`evaluating`.

---

## 8. Testing Strategy

### 8.1 Unit Tests

All tests in `test/unit/domain/audit/`.

**`parseGitHubUrl.test.ts`:**
| Input | Expected |
|-------|----------|
| `https://github.com/owner/repo` | `{ owner: 'owner', repo: 'repo' }` |
| `https://github.com/owner/repo.git` | `{ owner: 'owner', repo: 'repo' }` |
| `https://github.com/owner/repo/tree/main` | `{ owner: 'owner', repo: 'repo' }` |
| `https://github.com/owner/repo/` | `{ owner: 'owner', repo: 'repo' }` |
| `https://gitlab.com/owner/repo` | `null` |
| `not-a-url` | `null` |
| `''` | `null` |

**`fileFilter.test.ts`:**
| Input | Expected |
|-------|----------|
| `src/auth/login.ts` | `true` |
| `node_modules/lodash/index.js` | `false` |
| `public/logo.png` | `false` |
| `dist/bundle.js` | `false` |
| `package-lock.json` | `false` |
| `Dockerfile` | `true` |
| `config/db.yaml` | `true` |
| `.env.example` | `true` |

**`tokenEstimator.test.ts`:**
| Input | Expected |
|-------|----------|
| 4000 chars | 1000 tokens |
| 0 chars | 0 tokens |
| `getFilePriority('src/auth/login.ts')` | 1 |
| `getFilePriority('src/index.ts')` | 2 |
| `getFilePriority('src/utils/format.ts')` | 3 |

**`evaluator.test.ts`:**
| Function | Input | Expected |
|----------|-------|----------|
| `calculateSafetyProbability` | `[]` | `100` |
| `calculateSafetyProbability` | `[{ level: 'critical' }]` | `60` |
| `calculateSafetyProbability` | `[{ level: 'critical' }, { level: 'high' }]` | `35` |
| `calculateSafetyProbability` | 5 criticals | `0` (clamped) |
| `generateDisplayId` | `('abc', 1)` | `'SEC-A-001'` |
| `generateDisplayId` | `('xyz', 15)` | `'SEC-X-015'` |
| `generateExecutiveSummary` | `[]` | Contains "No security vulnerabilities" |
| `generateExecutiveSummary` | 2 critical + 1 high | Contains "2 Critical and 1 High" and "Deployment unsafe" |

**`actionBudget.test.ts`** (FMEA #1):
| Function | Input | Expected |
|----------|-------|----------|
| `isOverBudget` | `Date.now() - 100` (100ms ago) | `false` |
| `isOverBudget` | `Date.now() - 600_000` (10 min ago) | `true` |
| `isOverBudget` | `Date.now() - ACTION_BUDGET_MS` (exact boundary) | `true` |
| `ACTION_BUDGET_MS` | (constant) | `540_000` |
| `MAX_BLOB_FETCHES` | (constant) | `500` |

**`normalizeGitHubError.test.ts`** (FMEA #2):
| Status | Headers | Expected Code |
|--------|---------|---------------|
| 404 | any | `NOT_FOUND` |
| 429 | `{ rateLimitReset: futureTimestamp }` | `RATE_LIMIT` (message includes minutes) |
| 403 | `{ rateLimitRemaining: '0', rateLimitReset: futureTimestamp }` | `RATE_LIMIT` |
| 403 | `{ rateLimitRemaining: '42', rateLimitReset: null }` | `PRIVATE_REPO` |
| 403 | `{ rateLimitRemaining: null, rateLimitReset: null }` | `PRIVATE_REPO` |
| 500 | any | `GITHUB_ERROR` |
| 502 | any | `GITHUB_ERROR` |

**`sanitizeVulnerabilities.test.ts`** (FMEA #3):
| Input | Expected |
|-------|----------|
| Valid vulnerability with all fields | Pass-through (fields unchanged) |
| Title of 300 chars | Truncated to 200 + "…" |
| Description of 3000 chars | Truncated to 2000 + "…" |
| Empty title `""` | Dropped (returns null) |
| Empty description `""` | Dropped (returns null) |
| Unknown level `"extreme"` | Dropped (returns null) |
| 60 vulnerabilities | Capped at 50 |
| Missing optional `impact` | Returns `undefined` for impact |
| `filePath` of 600 chars | Truncated to 500 + "…" |

### 8.2 Contract Tests (FMEA #4)

**File: `test/unit/frontend/lib/auditMappers.test.ts`**

These tests assert the frontend/Convex contract stays aligned. They construct representative Convex `Doc` shapes (plain objects matching `Doc<'audit_events'>` and `Doc<'audit_analyses'>`) and run them through the mappers.

**`mapEventToMessage` contract tests:**
| Agent value | Expected mapped agent |
|-------------|-----------------------|
| `'INGESTION'` | `'ingestion'` |
| `'SECURITY_ANALYST'` | `'security'` |
| `'EVALUATOR'` | `'evaluator'` |
| Unknown string (defensive) | `'security'` (fallback) |
| Verify `_creationTime` maps to `timestamp` | number type preserved |
| Verify `_id` maps to `id` | string type preserved |

**`mapAnalysisToVulnerability` contract tests:**
| Scenario | Assertion |
|----------|-----------|
| All fields present | All mapped correctly; `level` → `severity`, `filePath` → `file`, `displayId` → `id` |
| `filePath` is `undefined` | `file` defaults to `'(architectural)'` |
| `impact` is `undefined` | `impact` defaults to `''` |
| `fix` is `undefined` | `fix` defaults to `''` |
| `level: 'critical'` | `severity: 'critical'` (enum preserved) |

---

## 9. Failure Modes & Mitigations (FMEA)

Pareto-ranked by Risk Priority Number (RPN). All mitigations are implemented in this spec.

| Rank | Failure Mode | RPN | Mitigation | Implementation | Proof |
|------|--------------|-----|------------|----------------|-------|
| 1 | **Convex action exceeds runtime / stalls mid-flight** | 315 | Wall-clock budget (`ACTION_BUDGET_MS = 540s`), file cap (`MAX_BLOB_FETCHES = 500`), try/catch envelope guaranteeing terminal `failed` state | `src/domain/audit/actionBudget.ts` + `startAuditAction.ts` try/catch wrapper + budget checks at every loop iteration and phase boundary | `actionBudget.test.ts`: unit tests on budget function; action always reaches `complete` or `failed` |
| 2 | **GitHub rate limiting not classified correctly** | 288 | Centralised `normalizeGitHubError` classifier handling 404, 429, 403+exhausted, 403+private; used by both `fetchRepoTree` and `fetchBlob`; blob-loop propagates RATE_LIMIT instead of `continue` | `src/domain/audit/normalizeGitHubError.ts` + updated `convex/clients/github.ts` + action blob-loop checks `error.code === 'RATE_LIMIT'` | `normalizeGitHubError.test.ts`: fixture responses/headers → assert correct error codes |
| 3 | **Claude returns structurally-valid JSON but semantically wrong** | 240 | Post-Zod sanitiser layer: clamp field lengths, enforce severity enum, drop entries with empty title/description, cap at 50 vulnerabilities | `src/domain/audit/sanitizeVulnerabilities.ts` applied after Zod parse in both `startAuditAction.ts` and `auditService.ts` | `sanitizeVulnerabilities.test.ts`: weird-but-valid payloads → assert sanitised or dropped |
| 4 | **Frontend/Convex contract drift** | 210 | Contract tests: representative `Doc<'audit_events'>`/`Doc<'audit_analyses'>` shapes → mappers → assert view model correctness; covers all agent enum values + optional field defaults | `test/unit/frontend/lib/auditMappers.test.ts` | Fails loudly on any agent enum addition, field rename, or optionality change |

### Previously identified (lower-risk, mitigated by existing design)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 5 | Large repo exceeds token limit | Medium | Truncation with priority sorting + file cap; UI shows truncation warning |
| 6 | Concurrent audits on same repo | Low | Each creates independent audit record; no conflict |
| 7 | Empty Claude response (0 vulnerabilities) | Low | Treated as 100% safe; valid result per protocol |

---

## 10. Prompt Execution Strategy

### Phase 1: Domain Pure Functions + Tests

> Gate: `pnpm app:compile && pnpm test:unit:ci`

#### Step 1.1: Create parseGitHubUrl

Create file `src/domain/audit/parseGitHubUrl.ts`.

Implement the `parseGitHubUrl` function as defined in Section 4.1 of this spec. Export it as a named export.

The function takes a URL string, strips trailing whitespace and `.git` suffix, then matches against the regex `/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/`. Returns `{ owner, repo }` or `null`.

Reference: `docs/protocol/ingestion/ingestion-protocol.md.md` Section 4.2.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.2: Create fileFilter

Create file `src/domain/audit/fileFilter.ts`.

Implement `shouldIncludeFile(path: string): boolean` as defined in Section 4.2 of this spec. Export it as a named export.

The function must check:
1. Exclusion directories (return false if path includes any)
2. Exclusion patterns via regex (return false if matches)
3. Binary extensions (return false if matches)
4. Allowed extensions (return true if matches)
5. Allowed filenames (return true if exact match)
6. Default: return false

Use exact lists from `docs/protocol/ingestion/ingestion-protocol.md.md` Section 6.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.3: Create tokenEstimator

Create file `src/domain/audit/tokenEstimator.ts`.

Implement and export:
- `estimateTokens(content: string): number` — returns `Math.ceil(content.length / 4)`
- `TOKEN_LIMIT = 200_000` — constant
- `getFilePriority(path: string): 1 | 2 | 3` — priority sorting per Section 4.3 of this spec

Reference: `docs/protocol/ingestion/ingestion-protocol.md.md` Section 7.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.4: Create evaluator

Create file `src/domain/audit/evaluator.ts`.

Extract these functions from `convex/services/auditService.ts` (lines 8-86):
- `SEVERITY_PENALTIES` constant
- `calculateSafetyProbability`
- `generateExecutiveSummary`
- `generateDisplayId`
- `generateAnalystMessage`

Export all as named exports. The function signatures and logic must be identical to what's in `convex/services/auditService.ts`. The `generateAnalystMessage` function should accept a plain object `{ level: string; category: string; title: string; description: string; filePath?: string }` as its first arg (not the Zod `Vulnerability` type, to avoid coupling domain to Zod).

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.5: Create actionBudget (FMEA #1)

Create file `src/domain/audit/actionBudget.ts`.

Implement and export:
- `ACTION_BUDGET_MS = 540_000` — constant (9 min, 1 min headroom before Convex 10-min limit)
- `MAX_BLOB_FETCHES = 500` — constant (hard cap on blob fetch count)
- `isOverBudget(startTime: number): boolean` — returns `true` when `Date.now() - startTime >= ACTION_BUDGET_MS`

See Section 4.5 of this spec for full signature.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.6: Create normalizeGitHubError (FMEA #2)

Create file `src/domain/audit/normalizeGitHubError.ts`.

Implement and export:
- `GitHubErrorInfo` interface: `{ code: 'NOT_FOUND' | 'RATE_LIMIT' | 'PRIVATE_REPO' | 'GITHUB_ERROR'; message: string }`
- `normalizeGitHubError(status: number, headers: { rateLimitRemaining: string | null; rateLimitReset: string | null }): GitHubErrorInfo`

Classification rules:
- 404 → `NOT_FOUND`
- 429 → `RATE_LIMIT` (with minutes until reset in message)
- 403 + `rateLimitRemaining === '0'` → `RATE_LIMIT`
- 403 + remaining quota → `PRIVATE_REPO`
- Everything else → `GITHUB_ERROR`

See Section 4.6 of this spec for full implementation.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.7: Create sanitizeVulnerabilities (FMEA #3)

Create file `src/domain/audit/sanitizeVulnerabilities.ts`.

Implement and export:
- `SANITIZE_LIMITS` constant object (maxVulnerabilities: 50, maxTitleLength: 200, maxDescriptionLength: 2000, maxImpactLength: 1000, maxFixLength: 2000, maxFilePathLength: 500, maxCategoryLength: 100)
- `SanitizedVulnerability` interface
- `sanitizeVulnerability(v: Record<string, unknown>): SanitizedVulnerability | null` — clamps string lengths, validates level enum, drops entries with empty title/description
- `sanitizeVulnerabilities(raw: Record<string, unknown>[]): SanitizedVulnerability[]` — maps, filters nulls, caps at maxVulnerabilities

See Section 4.7 of this spec for full implementation.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 1.8: Write unit tests for all domain functions

Create these test files:
- `test/unit/domain/audit/parseGitHubUrl.test.ts`
- `test/unit/domain/audit/fileFilter.test.ts`
- `test/unit/domain/audit/tokenEstimator.test.ts`
- `test/unit/domain/audit/evaluator.test.ts`
- `test/unit/domain/audit/actionBudget.test.ts`
- `test/unit/domain/audit/normalizeGitHubError.test.ts`
- `test/unit/domain/audit/sanitizeVulnerabilities.test.ts`

Test cases are defined in Section 8.1 of this spec. Use vitest globals (no imports needed for `describe`/`it`/`expect`). Import functions under test from `src/domain/audit/`.

Key tests for FMEA modules:
- `actionBudget.test.ts`: verify `isOverBudget` returns false for recent timestamps, true for expired ones, true at exact boundary
- `normalizeGitHubError.test.ts`: verify 404→NOT_FOUND, 429→RATE_LIMIT, 403+exhausted→RATE_LIMIT, 403+remaining→PRIVATE_REPO, 500→GITHUB_ERROR
- `sanitizeVulnerabilities.test.ts`: verify truncation at limits, dropping of invalid entries, cap at 50 items, pass-through of valid data

Run with: `pnpm vitest test/unit/domain/audit/ --config vitest.config.unit.ts --run`

##### Verify
- `pnpm app:compile`
- `pnpm vitest test/unit/domain/audit/ --config vitest.config.unit.ts --run`

##### Timeout
120000

#### Gate
- `pnpm app:compile`
- `pnpm vitest test/unit/domain/audit/ --config vitest.config.unit.ts --run`

---

### Phase 2: Schema + Mutation Updates

> Gate: `pnpm app:compile`

#### Step 2.1: Update Convex schema

Edit `convex/schema.ts`:

1. Change `commitHash: v.string()` to `commitHash: v.optional(v.string())` in the `audits` table.
2. Add `impact: v.optional(v.string())` to `audit_analyses` table, after the `description` field.
3. Add `v.literal('INGESTION')` to the `agent` union in `audit_events` table (before `SECURITY_ANALYST`).
4. Add `vulnerabilityCount: v.number()` to `audit_evaluations` table.

Do NOT change any indexes or other fields.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 2.2: Update Convex mutations

Edit `convex/analyses.ts`:
- Add `impact: v.optional(v.string())` to the `create` mutation args.

Edit `convex/evaluations.ts`:
- Add `vulnerabilityCount: v.number()` to the `create` mutation args.

Edit `convex/audits.ts`:
- In the `create` mutation, change `commitHash: v.string()` to `commitHash: v.optional(v.string())` in the args.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 2.3: Update Zod schema and Claude prompt

Edit `convex/services/schemas.ts`:
- Add `impact: z.string().optional()` to `VulnerabilitySchema`, after `description`.

Edit `convex/clients/claude.ts`:
- Add to the system prompt's field list (after the `description` bullet): `- impact: A concise statement of the business or security impact if exploited (e.g., "Enables unauthorized access to all user payment data")`
- Add `"impact": "Allows attackers to create checkout sessions for any user, enabling payment fraud and credit theft."` to the example JSON in the system prompt.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 2.4: Add createAndStart mutation and history query

Edit `convex/audits.ts`:

1. Add import for `parseGitHubUrl` from `../src/domain/audit/parseGitHubUrl` (use relative path from convex/).
2. Add import for `internal` from `./_generated/api`.
3. Add the `createAndStart` mutation as defined in Section 3.5 of this spec. It takes `{ repoUrl: v.string() }`, validates the URL, creates an audit record with `status: 'pending'` (no commitHash), schedules the `startAudit` action via `ctx.scheduler.runAfter(0, internal.services.startAuditAction.startAudit, { auditId, owner, repo })`, and returns `{ auditId, repoUrl: normalizedUrl }`.
4. Add the `listByRepoWithEvaluation` query as defined in Section 3.4 of this spec.

Note: The `internal.services.startAuditAction.startAudit` reference will not resolve until Step 3.1 creates that file. This step may show a TS error for that import — this is expected and resolved in Phase 3.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Gate
- `pnpm app:compile`

---

### Phase 3: Ingestion + Audit Action

> Gate: `pnpm app:compile`

#### Step 3.1: Create unified startAudit action

Create file `convex/services/startAuditAction.ts`.

Implement the `startAudit` internalAction as defined in Section 5.1 of this spec.

Imports needed:
- `v` from `convex/values`
- `internalAction` from `../_generated/server`
- `internal` from `../_generated/api`
- `type ActionCtx` from `../_generated/server`
- `type Id` from `../_generated/dataModel`
- `fetchRepoTree`, `fetchBlob` from `../clients/github`
- `runSecurityAnalysis` from `../clients/claude`
- `shouldIncludeFile` from `../../src/domain/audit/fileFilter`
- `estimateTokens`, `TOKEN_LIMIT`, `getFilePriority` from `../../src/domain/audit/tokenEstimator`
- `calculateSafetyProbability`, `generateExecutiveSummary`, `generateDisplayId`, `generateAnalystMessage` from `../../src/domain/audit/evaluator`
- `isOverBudget`, `MAX_BLOB_FETCHES` from `../../src/domain/audit/actionBudget`
- `sanitizeVulnerabilities` from `../../src/domain/audit/sanitizeVulnerabilities`

The action must:
1. Capture `Date.now()` at entry as `actionStart`
2. **Wrap the entire pipeline in try/catch** — the catch block calls `internal.audits.fail` with the error message, guaranteeing terminal state (FMEA #1)
3. Update audit status through each phase (fetching → analyzing → evaluating → complete)
4. Create INGESTION, SECURITY_ANALYST, and EVALUATOR feed events
5. **Triple-bounded blob loop** (FMEA #1): checks `isOverBudget(actionStart)`, `files.length >= MAX_BLOB_FETCHES`, and `totalTokens + tokens > TOKEN_LIMIT` at every iteration
6. **Propagate rate-limit errors from blob fetching** (FMEA #2): if `blobResult.error.code === 'RATE_LIMIT'`, fail the audit immediately instead of `continue`
7. **Sanitise vulnerabilities** (FMEA #3): call `sanitizeVulnerabilities()` on the Zod-parsed array before the insert loop
8. Use `Buffer.from(content, 'base64').toString('utf-8')` to decode blob content

Note: Convex actions run in a Node.js environment so `Buffer` is available.

##### Verify
- `pnpm app:compile`

##### Timeout
180000

#### Step 3.2: Update GitHub client to use normalizeGitHubError (FMEA #2)

Edit `convex/clients/github.ts`:

1. Import `normalizeGitHubError` from `../../src/domain/audit/normalizeGitHubError`.
2. In `fetchRepoTree`: replace the inline error classification block (the `if (response.status === 404)` / `if (response.status === 403)` chain) with a single call:
   ```typescript
   const errorInfo = normalizeGitHubError(response.status, {
     rateLimitRemaining: response.headers.get('X-RateLimit-Remaining'),
     rateLimitReset: response.headers.get('X-RateLimit-Reset'),
   });
   return { success: false, error: errorInfo };
   ```
3. In `fetchBlob`: replace the generic error return with the same `normalizeGitHubError` call. This is the critical fix — `fetchBlob` currently returns `GITHUB_ERROR` for all failures, which means rate limits during blob fetching are silently skipped by the action's `continue`. After this change, rate limits will be correctly classified as `RATE_LIMIT`.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 3.3: Update existing auditService

Edit `convex/services/auditService.ts`:

1. Replace the local function definitions (`SEVERITY_PENALTIES`, `calculateSafetyProbability`, `generateExecutiveSummary`, `generateDisplayId`, `generateAnalystMessage`) with imports from `../../src/domain/audit/evaluator`.
2. Import `sanitizeVulnerabilities` from `../../src/domain/audit/sanitizeVulnerabilities`.
3. After the Zod validation of `analysisResult.data.vulnerabilities`, add: `const vulnerabilities = sanitizeVulnerabilities(analysisResult.data.vulnerabilities as Record<string, unknown>[]);` (FMEA #3).
4. In the for-loop where vulnerabilities are stored, add `impact: vuln.impact` to the `internal.analyses.create` call.

The existing `runAudit` action export stays as-is — it's still valid for direct use with pre-fetched files.

##### Verify
- `pnpm app:compile`

##### Timeout
120000

#### Gate
- `pnpm app:compile`

---

### Phase 4: Frontend Integration

> Gate: `pnpm app:compile && pnpm app:build`

#### Step 4.1: Update frontend types

Edit `src/frontend/types.ts` as defined in Section 6.1:

1. Change `AgentRole` to `'ingestion' | 'security' | 'evaluator'`.
2. Remove `belief?: number` from `AgentMessage`.
3. Update `Vulnerability` interface:
   - Rename `file` to `file: string` (keep as-is, the mapper handles the translation from `filePath`)
   - Change `severity` type reference to match (keep as `Severity`)
   - Add `category: string`
   - Add `impact: string`
   - Remove `status: 'open' | 'fixed'`
   - Remove `commitDetected: string`

Keep `AuditStatus`, `AuditSnapshot`, `CommitData`, `Severity`, `SeverityFilter` as-is.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 4.2: Create audit mappers

Create file `src/frontend/lib/auditMappers.ts`.

Implement `mapAnalysisToVulnerability` and `mapEventToMessage` as defined in Section 6.2 of this spec.

Import the Convex `Doc` type from `../../../convex/_generated/dataModel` and the frontend types from `../types`.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 4.3: Refactor SecurityAuditApp

This is the largest change. Edit `src/frontend/components/SecurityAuditApp.tsx`:

**Remove:**
- All mock data imports (`AUDIT_SCENARIO_MESSAGES`, `FIX_SCENARIO_MESSAGES`, `INITIAL_VULNERABILITIES`, `generateCommitHash`)
- The `intervalRef` and its cleanup effect
- The `createMessage` helper function
- The `startAudit` function (mock simulation with setInterval)
- The `simulateNewCommit` function

**Add imports:**
- `useMutation`, `useQuery` from `convex/react`
- `api` from `../../../convex/_generated/api`
- `type Id` from `../../../convex/_generated/dataModel`
- `mapAnalysisToVulnerability`, `mapEventToMessage` from `../lib/auditMappers`
- `parseGitHubUrl` from `@/src/domain/audit/parseGitHubUrl`
- `calculateSafetyProbability` from `@/src/domain/audit/evaluator`

**Replace state management:**
Use the state model, Convex hooks, and derived state from Section 6.3 of this spec. Key patterns:
- `useState` for `repoUrl`, `currentAuditId`, `vulnFilter`, `selectedVuln`, `isHistoryOpen`, `selectedCommitHash`, `error`
- `useMutation(api.audits.createAndStart)` for starting audits
- `useQuery` with conditional `'skip'` for all subscriptions
- `useMemo` for derived data (messages, vulnerabilities, currentConsensus, commits)

**Update the JSX:**
- The "Start Audit" button calls `handleStartAudit` (async, calls createAndStart mutation)
- The `status` variable becomes `uiStatus` derived from `audit?.status`
- Remove `onApplyFixes` prop from `VulnerabilitiesPanel`
- Remove `isAuditComplete` prop from `VulnerabilitiesPanel`
- Show error banner when `audit?.status === 'failed'` or when `error` state is set
- Show truncation warning when `audit?.truncated === true`

The component should display the audit's error message from `audit?.error` in a dismissible banner below the header when the audit fails.

##### Verify
- `pnpm app:compile`

##### Timeout
180000

#### Step 4.4: Update AgentFeed

Edit `src/frontend/components/AgentFeed.tsx`:

Replace `'retriever'` with `'ingestion'` in all agent display functions:
- `getAgentIcon`: `'ingestion'` returns `<FileSearch />`
- `getAgentColorStyles`: `'ingestion'` returns `'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'`
- `getAgentName`: `'ingestion'` returns `'Ingestion'`
- `getAgentTextColor`: `'ingestion'` returns `'text-indigo-400'`

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 4.5: Update VulnerabilityModal

Edit `src/frontend/components/VulnerabilityModal.tsx`:

1. Update the header metadata section: replace `vulnerability.status` badge with a category badge showing `vulnerability.category` (uppercase).
2. Replace the "Detected In Commit" metadata item with a "Vulnerability ID" item showing `vulnerability.id`.
3. Remove the `vulnerability.commitDetected` reference.
4. Remove the `vulnerability.status` reference (the `CheckCircle2`/`XCircle` open/fixed badges).

The Description, Impact, and Remediation sections remain unchanged — they already reference the correct fields.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 4.6: Update VulnerabilitiesPanel

Edit `src/frontend/components/VulnerabilitiesPanel.tsx`:

1. Remove the `onApplyFixes` prop from the interface.
2. Remove the `isAuditComplete` prop from the interface.
3. Remove the "Apply Fixes & Commit" button that uses these props.
4. In the vulnerability card, change `v.severity` to `v.severity` (already correct since the mapper produces this).
5. If the card displays `v.status`, remove that.
6. If the card displays `v.file`, that now comes from the mapper and works correctly.

##### Verify
- `pnpm app:compile`

##### Timeout
60000

#### Step 4.7: Write mapper contract tests (FMEA #4)

Create file `test/unit/frontend/lib/auditMappers.test.ts`.

Test cases are defined in Section 8.2 of this spec. Use vitest globals.

Import `mapAnalysisToVulnerability` and `mapEventToMessage` from `src/frontend/lib/auditMappers`.

Construct representative Convex Doc objects as plain JS objects with `_id`, `_creationTime`, and all required fields. **Do not import from `convex/_generated`** — use plain objects to keep the test decoupled from Convex codegen.

Key assertions:
1. **Agent enum exhaustiveness**: test that every value in the set `['INGESTION', 'SECURITY_ANALYST', 'EVALUATOR']` maps to a valid `AgentRole` — not the fallback.
2. **Optional field defaults**: verify `impact: undefined` → `''`, `filePath: undefined` → `'(architectural)'`, `fix: undefined` → `''`.
3. **Timestamp mapping**: verify `_creationTime` (number) maps to `timestamp` (number).
4. **Level-to-severity passthrough**: verify `level: 'critical'` maps to `severity: 'critical'` (type narrowing preserved).

Run with: `pnpm vitest test/unit/frontend/lib/auditMappers.test.ts --config vitest.config.unit.ts --run`

##### Verify
- `pnpm app:compile`
- `pnpm vitest test/unit/frontend/lib/auditMappers.test.ts --config vitest.config.unit.ts --run`

##### Timeout
120000

#### Gate
- `pnpm app:compile`
- `pnpm app:lint`
- `pnpm app:build`
- `pnpm vitest test/unit/domain/audit/ --config vitest.config.unit.ts --run`
- `pnpm vitest test/unit/frontend/lib/auditMappers.test.ts --config vitest.config.unit.ts --run`

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-21 | FMEA mitigations: action budget/watchdog (#1), GitHub error normalizer (#2), vulnerability sanitizer (#3), mapper contract tests (#4). Added Sections 4.5-4.7, rewrote Section 5.1 action with try/catch envelope + triple-bounded loop, updated Phase 1/3/4 execution steps. |
| 1.0.0 | 2026-02-21 | Initial specification |
