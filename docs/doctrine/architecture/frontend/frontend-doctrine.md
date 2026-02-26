# Frontend Doctrine (Next.js + React + Convex)

**Version**: 1.3.0
**Status**: Binding
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

---

## 2. Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict) |
| UI Library | React 19 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Charts | Recharts |
| Animation | Motion (v12+, imported as `motion/react`) |
| Backend | Convex (real-time subscriptions) |

---

## 3. Directory Structure

```
app/                             # Next.js App Router
├── layout.tsx                   # Root layout (fonts, metadata)
├── globals.css                  # Tailwind imports + theme tokens
├── page.tsx                     # Landing page (renders LandingPage)
└── roast/
    └── page.tsx                 # Audit dashboard (renders SecurityAuditApp, reads ?url= param)

src/frontend/                    # All React frontend code
├── components/                  # UI components
│   ├── LandingPage.tsx          # Marketing landing page with CTA → /roast
│   ├── SecurityAuditApp.tsx     # Main orchestrating component (Convex subscriptions)
│   ├── AgentFeed.tsx            # Agent activity feed (ingestion/security/evaluator)
│   ├── DeploymentSafetyChart.tsx
│   ├── VulnerabilitiesPanel.tsx
│   └── VulnerabilityModal.tsx
│
├── lib/                         # Utilities + mappers
│   ├── cn.ts                    # clsx + tailwind-merge
│   └── auditMappers.ts         # Convex Doc → frontend view model mappers
│
└── types.ts                     # Shared frontend TypeScript types
```

Flat structure. No feature folders, no DI, no repositories. Extract when complexity demands it.

---

## 4. Next.js App Router Patterns

### 4.1 Client Components

All interactive components MUST have `'use client';` as the first line. This applies to any component using hooks, browser APIs, event handlers, or third-party libraries that require browser context (Motion, Recharts).

```typescript
'use client';

import { useState } from 'react';

export function MyComponent() {
  const [value, setValue] = useState('');
  // ...
}
```

### 4.2 Page Components

Page components in `app/` are server components by default. They import and render client components:

```typescript
// app/page.tsx — Server component (no 'use client')
import { LandingPage } from '@/src/frontend/components/LandingPage';

export default function Home() {
  return <LandingPage />;
}

// app/roast/page.tsx — Server component with searchParams
import SecurityAuditApp from '@/src/frontend/components/SecurityAuditApp';

export default async function RoastPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  return <SecurityAuditApp initialUrl={url} />;
}
```

### 4.3 Path Aliases

The `@/*` alias maps to the project root. All imports from `src/frontend/` use:

```typescript
import { cn } from '@/src/frontend/lib/cn';
import type { Vulnerability } from '@/src/frontend/types';
import { mapAnalysisToVulnerability } from '@/src/frontend/lib/auditMappers';
```

Relative imports are used only within the same directory level (e.g., `./AgentFeed`).

---

## 5. Convex Integration

### 5.1 Provider Setup

```typescript
// app/providers.tsx
'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

```typescript
// app/layout.tsx
import { ConvexClientProvider } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

### 5.2 Queries (Real-time by Default)

```typescript
'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

function AnalysisFeed({ auditId }: { auditId: Id<'audits'> }) {
  const analyses = useQuery(api.analyses.listByAudit, { auditId });

  if (analyses === undefined) return <Skeleton />;

  return (
    <ul>
      {analyses.map((a) => (
        <AnalysisCard key={a._id} analysis={a} />
      ))}
    </ul>
  );
}
```

### 5.3 Conditional Queries with `'skip'`

Skip queries when the required argument is not yet available:

```typescript
const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(null);

// Only subscribe when we have an audit ID
const audit = useQuery(api.audits.get, currentAuditId ? { auditId: currentAuditId } : 'skip');
const events = useQuery(api.auditEvents.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
const analyses = useQuery(api.analyses.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
```

### 5.4 Streaming Inference Subscription

For real-time streaming text display, subscribe to the active streaming inference:

```typescript
const streamingInference = useQuery(
  api.inferences.getStreamingByAudit,
  currentAuditId ? { auditId: currentAuditId } : 'skip',
);

// Pass streaming text to display components
<AgentFeed
  messages={messages}
  isAuditing={uiStatus === 'auditing'}
  streamingText={streamingInference?.streamingText ?? null}
/>
```

The query returns `null` when no inference is actively streaming. Components receiving `streamingText` SHOULD render it in a dedicated streaming block with a visual indicator (e.g., `animate-pulse` label).

### 5.5 Mapper Pattern (Convex Doc → View Model)

Convex `Doc<'table'>` types contain backend fields (`_id`, `_creationTime`, backend enum values). Frontend components use view model types. Mappers bridge the two:

```typescript
// src/frontend/lib/auditMappers.ts
import type { Doc } from '../../../convex/_generated/dataModel';
import type { Vulnerability } from '../types';

export function mapAnalysisToVulnerability(analysis: Doc<'audit_analyses'>): Vulnerability {
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
```

MUST use mappers when Convex types and view model types diverge. MUST test mappers with contract tests (see Section 11).
```

### 5.6 Mutations (Create + Schedule Pattern)

The preferred pattern is a mutation that creates a record and schedules a backend action. The frontend calls the mutation and tracks the audit ID for subscriptions:

```typescript
'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

function SecurityAuditApp() {
  const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createAndStart = useMutation(api.audits.createAndStart);

  const handleStartAudit = async () => {
    setError(null);
    try {
      const result = await createAndStart({ repoUrl });
      setCurrentAuditId(result.auditId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };
}
```

MUST NOT call actions directly from the frontend for the audit flow. Use mutations that schedule actions via `ctx.scheduler.runAfter`.

---

## 6. Component Patterns

### 6.1 Utility: `cn()`

```typescript
// src/frontend/lib/cn.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 6.2 Basic Component

```typescript
// src/frontend/components/Badge.tsx
'use client';

import { cn } from '@/src/frontend/lib/cn';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const severityStyles: Record<Severity, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

interface BadgeProps {
  severity: Severity;
  children: React.ReactNode;
}

export function Badge({ severity, children }: BadgeProps) {
  return (
    <span className={cn('rounded px-2 py-1 text-xs font-medium', severityStyles[severity])}>
      {children}
    </span>
  );
}
```

### 6.3 Loading States

```typescript
// Pattern: undefined = loading, null = not found, data = ready
const audit = useQuery(api.audits.get, { auditId });

if (audit === undefined) return <AuditSkeleton />;
if (audit === null) return <NotFound />;
return <AuditDetail audit={audit} />;
```

MUST handle all three states. MUST NOT render stale data as if current.

---

## 7. Styling Rules

### 7.1 VibeSafe Design Tokens

Theme tokens are defined in `app/globals.css` under `@theme inline`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-dark` | `#0B0F14` | Page background |
| `--color-panel-dark` | `#0F1620` | Card/panel background |
| `--color-divider-dark` | `#1C2430` | Borders, dividers |
| `--color-accent-blue` | `#4DA3FF` | Primary accent, links, CTAs |
| `--color-text-primary` | `#E6EEF8` | Primary text |
| `--color-text-secondary` | `#8FA3B8` | Secondary text, labels |
| `--font-display` | Syne | Display headings (loaded via `next/font/google`) |

Components currently use Tailwind arbitrary values (e.g., `bg-[#0B0F14]`). These MAY be migrated to theme token classes in a future pass.

### 7.2 Semantic Color Conventions

| Meaning | Color |
|---------|-------|
| Safe / Fixed | `text-emerald-400`, `bg-emerald-500/10` |
| Unsafe / Critical | `text-red-400`, `bg-red-500/10` |
| Warning / High | `text-orange-400`, `bg-orange-500/10` |
| Needs Work / Medium | `text-yellow-400`, `bg-yellow-500/10` |
| Info / Low | `text-blue-400`, `bg-blue-500/10` |
| Accent | `text-[#4DA3FF]`, `bg-[#4DA3FF]` |

### 7.3 Dark Mode

App is dark mode only. MUST NOT include light mode styles.

### 7.4 Responsive

Mobile-first. Use `sm:`, `md:`, `lg:` prefixes for larger screens.

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

## 8. State Management

### 8.1 Server State

Convex handles all server state. MUST NOT duplicate in React state.

```typescript
// ✗ WRONG: duplicating server state
const [analyses, setAnalyses] = useState([]);
useEffect(() => {
  fetchAnalyses().then(setAnalyses);
}, []);

// ✓ CORRECT: let Convex manage it
const analyses = useQuery(api.analyses.listByAudit, { auditId });
```

### 8.2 UI State

Local UI state (modals, tabs, form inputs) uses `useState`:

```typescript
const [activeTab, setActiveTab] = useState<'all' | 'critical'>('all');
const [repoUrl, setRepoUrl] = useState('');
const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(null);
```

### 8.3 Derived State

Use `useMemo` to derive view model data from Convex subscriptions:

```typescript
// Map Convex docs to view model types
const vulnerabilities = useMemo(
  () => (analyses ?? []).map(mapAnalysisToVulnerability),
  [analyses],
);

// Compute running metrics from real-time data
const currentConsensus = useMemo(() => {
  if (evaluation) return evaluation.probability;
  if (!analyses || analyses.length === 0) return 100;
  return calculateSafetyProbability(analyses);
}, [analyses, evaluation]);
```

MUST use `useMemo` for any non-trivial transformation of Convex subscription data.

---

## 9. Error Handling

### 9.1 Query Errors

Convex queries don't throw by default. Handle missing data:

```typescript
const audit = useQuery(api.audits.get, { auditId });

if (audit === undefined) return <Loading />;
if (audit === null) return <div>Audit not found</div>;
```

### 9.2 Mutation Errors

Mutations can throw. Wrap in try/catch:

```typescript
const createAudit = useMutation(api.audits.create);

const handleSubmit = async () => {
  try {
    await createAudit({ repoUrl, commitHash });
  } catch (error) {
    toast.error('Failed to create audit');
  }
};
```

---

## 10. File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase.tsx` | `AgentFeed.tsx` |
| Hook | `use{Name}.ts` | `useAuditStatus.ts` |
| Utility | `camelCase.ts` | `cn.ts` |
| Constants / Data | `camelCase.ts` | `mockAuditData.ts` |
| Types | `types.ts` (shared) or colocated | `src/frontend/types.ts` |

---

## 11. Testing

### 11.1 Component Tests

Use Vitest + React Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import { Badge } from '@/src/frontend/components/Badge';

test('renders critical badge with correct style', () => {
  render(<Badge severity="critical">SEC-001</Badge>);

  const badge = screen.getByText('SEC-001');
  expect(badge).toHaveClass('text-red-400');
});
```

### 11.2 Integration Tests (Post-Convex)

For components using Convex, mock the hooks:

```typescript
import { vi } from 'vitest';
import * as convexReact from 'convex/react';

vi.spyOn(convexReact, 'useQuery').mockReturnValue([
  { _id: '1', title: 'Test Analysis', level: 'critical' },
]);
```

---

## 12. Performance

### 12.1 Query Granularity

Prefer multiple small queries over one large query:

```typescript
// ✓ GOOD: components subscribe to what they need
const audit = useQuery(api.audits.get, currentAuditId ? { auditId: currentAuditId } : 'skip');
const analyses = useQuery(api.analyses.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
const events = useQuery(api.auditEvents.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');

// ✗ AVOID: one mega-query that returns everything
const everything = useQuery(api.audits.getWithAllRelations, { auditId });
```

---

## 13. Future Extraction Path

If Vibesafe grows:

1. **Multiple pages** → Use Next.js App Router `app/` directory (already in place)
2. **Shared component library** → Extract to `src/frontend/components/ui/` with Storybook
3. **Complex forms** → Add React Hook Form + Zod
4. **Global UI state** → Add Zustand for modals, toasts, sidebar
5. **More mapper files** → Extract to `src/frontend/lib/` as new Convex tables are added

This is a refactor, not a rewrite.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial minimal frontend doctrine for Vibesafe |
| 1.2.0 | 2026-02-21 | Convex integration: removed mock data patterns, added mapper pattern (Doc → view model), conditional query skip, derived state with useMemo, create+schedule mutation pattern, contract test guidance |
| 1.3.0 | 2026-02-26 | Realtime streaming: added streaming inference subscription pattern (Section 5.4), streamingText prop pattern for AgentFeed |
| 1.1.0 | 2026-02-21 | Updated for Next.js 16 App Router: directory structure, path aliases, `'use client'` patterns, VibeSafe design tokens, mock state section |
