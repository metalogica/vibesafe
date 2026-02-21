# Frontend Doctrine (Next.js + React + Convex)

**Version**: 1.1.0
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
| Backend (planned) | Convex (real-time) |

---

## 3. Directory Structure

```
app/                             # Next.js App Router
├── layout.tsx                   # Root layout (fonts, metadata)
├── globals.css                  # Tailwind imports + theme tokens
└── page.tsx                     # Home page (renders SecurityAuditApp)

src/frontend/                    # All React frontend code
├── components/                  # UI components
│   ├── SecurityAuditApp.tsx     # Main orchestrating component
│   ├── AgentFeed.tsx            # Agent activity feed
│   ├── DeploymentSafetyChart.tsx
│   ├── VulnerabilitiesPanel.tsx
│   └── VulnerabilityModal.tsx
│
├── data/                        # Mock data (until Convex integration)
│   └── mockAuditData.ts
│
├── lib/                         # Utilities
│   └── cn.ts                    # clsx + tailwind-merge
│
└── types.ts                     # Shared TypeScript types
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
import SecurityAuditApp from '@/src/frontend/components/SecurityAuditApp';

export default function Home() {
  return <SecurityAuditApp />;
}
```

### 4.3 Path Aliases

The `@/*` alias maps to the project root. All imports from `src/frontend/` use:

```typescript
import { cn } from '@/src/frontend/lib/cn';
import type { Vulnerability } from '@/src/frontend/types';
import { INITIAL_VULNERABILITIES } from '@/src/frontend/data/mockAuditData';
```

Relative imports are used only within the same directory level (e.g., `./AgentFeed`).

---

## 5. Convex Integration (Planned)

Convex is not yet integrated. When added, follow these patterns:

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

### 5.3 Mutations

```typescript
'use client';

import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

function StartAuditButton({ repoUrl }: { repoUrl: string }) {
  const createAudit = useMutation(api.audits.create);

  const handleClick = async () => {
    const auditId = await createAudit({ repoUrl, commitHash: 'HEAD' });
    // Navigate or update UI
  };

  return <Button onClick={handleClick}>Start Audit</Button>;
}
```

### 5.4 Actions (External APIs)

```typescript
'use client';

import { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

function RunAnalysisButton({ auditId }: { auditId: Id<'audits'> }) {
  const runAnalysis = useAction(api.services.auditService.runAnalysis);
  const [isRunning, setIsRunning] = useState(false);

  const handleClick = async () => {
    setIsRunning(true);
    const result = await runAnalysis({ auditId });
    if (!result.success) {
      toast.error(result.error.message);
    }
    setIsRunning(false);
  };

  return (
    <Button onClick={handleClick} disabled={isRunning}>
      {isRunning ? 'Analyzing...' : 'Run Analysis'}
    </Button>
  );
}
```

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

### 8.1 Server State (Post-Convex)

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
```

### 8.3 Mock State (Pre-Convex)

Until Convex is integrated, mock data lives in `src/frontend/data/` and state is managed via `useState` + `useRef` in the orchestrating component. This will be replaced by Convex queries/subscriptions.

---

## 9. Error Handling

### 9.1 Query Errors (Post-Convex)

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

### 12.1 Query Granularity (Post-Convex)

Prefer multiple small queries over one large query:

```typescript
// ✓ GOOD: components subscribe to what they need
const audit = useQuery(api.audits.get, { auditId });
const analyses = useQuery(api.analyses.listByAudit, { auditId });

// ✗ AVOID: one mega-query that returns everything
const everything = useQuery(api.audits.getWithAllRelations, { auditId });
```

### 12.2 Conditional Queries

Skip queries when data isn't needed:

```typescript
const evaluation = useQuery(
  api.evaluations.getByAudit,
  audit?.status === 'complete' ? { auditId } : 'skip',
);
```

---

## 13. Future Extraction Path

If Vibesafe grows:

1. **Multiple pages** → Use Next.js App Router `app/` directory (already in place)
2. **Shared component library** → Extract to `src/frontend/components/ui/` with Storybook
3. **Complex forms** → Add React Hook Form + Zod
4. **Global UI state** → Add Zustand for modals, toasts, sidebar
5. **Convex integration** → Replace mock data with real-time subscriptions

This is a refactor, not a rewrite.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial minimal frontend doctrine for Vibesafe |
| 1.1.0 | 2026-02-21 | Updated for Next.js 16 App Router: directory structure, path aliases, `'use client'` patterns, VibeSafe design tokens, mock state section |
