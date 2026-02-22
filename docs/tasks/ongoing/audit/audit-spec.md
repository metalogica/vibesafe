# Audit Feature: Technical Specification

**Version**: 1.0.0
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
    // === INGESTION PHASE ===

    // 1. Update status to fetching
    await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'fetching' });

    // 2. Create ingestion feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'INGESTION',
      message: `Fetching repository ${owner}/${repo} from GitHub...`,
    });

    // 3. Fetch tree from GitHub
    const treeResult = await fetchRepoTree(owner, repo);
    if (!treeResult.success) {
      await ctx.runMutation(internal.audits.fail, { auditId, error: treeResult.error.message });
      return;
    }

    const { sha: commitHash, tree } = treeResult.data;

    // 4. Filter files
    const sourceFiles = tree.filter(entry => entry.type === 'blob' && shouldIncludeFile(entry.path));

    if (sourceFiles.length === 0) {
      await ctx.runMutation(internal.audits.fail, { auditId, error: 'No source code files found in repository' });
      return;
    }

    // 5. Ingestion feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'INGESTION',
      message: `Found ${sourceFiles.length} source files. Fetching contents...`,
    });

    // 6. Sort by security priority
    const sortedFiles = [...sourceFiles].sort((a, b) => {
      const pa = getFilePriority(a.path);
      const pb = getFilePriority(b.path);
      if (pa !== pb) return pa - pb;
      return a.path.localeCompare(b.path);
    });

    // 7. Fetch blobs with token budget
    const files: { path: string; content: string }[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const entry of sortedFiles) {
      const blobResult = await fetchBlob(owner, repo, entry.sha);
      if (!blobResult.success) continue;

      const content = Buffer.from(blobResult.data.content, 'base64').toString('utf-8');
      const tokens = estimateTokens(content);

      if (totalTokens + tokens > TOKEN_LIMIT) {
        truncated = true;
        break;
      }

      files.push({ path: entry.path, content });
      totalTokens += tokens;
    }

    // 8. Store ingest stats
    await ctx.runMutation(internal.audits.updateIngestStats, {
      auditId,
      commitHash,
      truncated,
      stats: {
        totalFiles: sourceFiles.length,
        includedFiles: files.length,
        totalTokens: sourceFiles.length * 250, // rough estimate for total
        includedTokens: totalTokens,
      },
    });

    // 9. Ingestion complete feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'INGESTION',
      message: truncated
        ? `Ingestion complete. ${files.length}/${sourceFiles.length} files loaded (token limit reached). Starting analysis...`
        : `Ingestion complete. ${files.length} files loaded. Starting analysis...`,
    });

    // === ANALYSIS PHASE ===
    // (Delegates to existing audit service logic)

    // 10. Update status to analyzing
    await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'analyzing' });

    // 11. Call Claude
    const analysisResult = await runSecurityAnalysis(files);
    if (!analysisResult.success) {
      await ctx.runMutation(internal.audits.fail, { auditId, error: analysisResult.error.message });
      return;
    }

    const vulnerabilities = analysisResult.data.vulnerabilities;

    // 12. Store each vulnerability + create feed event
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

    // 13. Update status to evaluating
    await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'evaluating' });

    // 14. Calculate score + summary
    const probability = calculateSafetyProbability(vulnerabilities);
    const executiveSummary = generateExecutiveSummary(vulnerabilities);

    // 15. Store evaluation
    await ctx.runMutation(internal.evaluations.create, {
      auditId,
      probability,
      executiveSummary,
      vulnerabilityCount: vulnerabilities.length,
    });

    // 16. Evaluator feed event
    await ctx.runMutation(internal.auditEvents.create, {
      auditId,
      agent: 'EVALUATOR',
      message: executiveSummary,
    });

    // 17. Mark complete
    await ctx.runMutation(internal.audits.updateStatus, { auditId, status: 'complete' });
  },
});
```

### 5.2 Updates to Existing Files

**`convex/services/auditService.ts`**: Update the `runAudit` action to pass `impact` when creating analyses. Import evaluator functions from `src/domain/audit/evaluator.ts` instead of defining them locally. The existing `runAudit` action stays as-is for backward compatibility (it can be called independently with pre-fetched files).

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
| `RATE_LIMIT` | GitHub 403 / Claude 429 | "Rate limit hit. Try again in a few minutes." |
| `EMPTY_REPO` | No files pass filter | "No source code files found in repository" |
| `CLAUDE_ERROR` | Claude API failure | "Analysis failed. Please try again." |
| `INVALID_RESPONSE` | Claude returns malformed JSON | "Analysis returned invalid results. Please try again." |
| `NETWORK_ERROR` | fetch() failure | "Network error. Please check your connection." |

Errors are stored in `audits.error` field. The frontend reads `audit.status === 'failed'` and displays `audit.error`.

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

---

## 9. Failure Modes & Mitigations (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | GitHub rate limit during blob fetching | High | Check rate limit headers; fail gracefully with partial results |
| 2 | Claude returns non-JSON | High | Zod validation catches it; audit marked failed with clear error |
| 3 | Large repo exceeds token limit | Medium | Truncation with priority sorting; UI shows truncation warning |
| 4 | Network timeout during long fetch | High | Convex action timeout (10 min default); audit marked failed |
| 5 | Concurrent audits on same repo | Low | Each creates independent audit record; no conflict |
| 6 | Empty Claude response (0 vulnerabilities) | Low | Treated as 100% safe; valid result per protocol |

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

#### Step 1.5: Write unit tests

Create these test files:
- `test/unit/domain/audit/parseGitHubUrl.test.ts`
- `test/unit/domain/audit/fileFilter.test.ts`
- `test/unit/domain/audit/tokenEstimator.test.ts`
- `test/unit/domain/audit/evaluator.test.ts`

Test cases are defined in Section 8.1 of this spec. Use vitest globals (no imports needed for `describe`/`it`/`expect`). Import functions under test from `src/domain/audit/`.

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
- `fetchRepoTree`, `fetchBlob` from `../clients/github`
- `runSecurityAnalysis` from `../clients/claude`
- `shouldIncludeFile` from `../../src/domain/audit/fileFilter`
- `estimateTokens`, `TOKEN_LIMIT`, `getFilePriority` from `../../src/domain/audit/tokenEstimator`
- `calculateSafetyProbability`, `generateExecutiveSummary`, `generateDisplayId`, `generateAnalystMessage` from `../../src/domain/audit/evaluator`

The action must:
1. Update audit status through each phase (fetching → analyzing → evaluating → complete)
2. Create INGESTION feed events during repo fetching
3. Create SECURITY_ANALYST feed events for each vulnerability found
4. Create EVALUATOR feed event with executive summary
5. Handle errors by calling `internal.audits.fail` and returning early
6. Use `Buffer.from(content, 'base64').toString('utf-8')` to decode blob content

Note: Convex actions run in a Node.js environment so `Buffer` is available.

##### Verify
- `pnpm app:compile`

##### Timeout
180000

#### Step 3.2: Update existing auditService

Edit `convex/services/auditService.ts`:

1. Replace the local function definitions (`SEVERITY_PENALTIES`, `calculateSafetyProbability`, `generateExecutiveSummary`, `generateDisplayId`, `generateAnalystMessage`) with imports from `../../src/domain/audit/evaluator`.
2. In the for-loop where vulnerabilities are stored (around line 136), add `impact: vuln.impact` to the `internal.analyses.create` call.

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

#### Gate
- `pnpm app:compile`
- `pnpm app:lint`
- `pnpm app:build`
- `pnpm vitest test/unit/domain/audit/ --config vitest.config.unit.ts --run`

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial specification |
