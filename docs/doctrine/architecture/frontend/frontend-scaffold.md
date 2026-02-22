# Frontend Component Scaffold (Next.js + Convex)

**Version**: 1.2.0
**Status**: Reference
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Purpose

Copy-paste templates for creating components in the Next.js App Router project. Minimal structure — no DI, no repositories, no Container/UI split.

**Important**: All interactive components MUST have `'use client';` as the first line.

---

## 2. Basic Component with Query (Post-Convex)

```typescript
// src/frontend/components/AnalysisList.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

interface AnalysisListProps {
  auditId: Id<'audits'>;
}

export function AnalysisList({ auditId }: AnalysisListProps) {
  const analyses = useQuery(api.analyses.listByAudit, { auditId });

  // Loading
  if (analyses === undefined) {
    return <AnalysisListSkeleton />;
  }

  // Empty
  if (analyses.length === 0) {
    return <p className="text-[#8FA3B8]">No vulnerabilities found.</p>;
  }

  // Data
  return (
    <ul className="space-y-3">
      {analyses.map((analysis) => (
        <li key={analysis._id}>
          <div className="rounded-lg border border-[#1C2430] bg-[#0F1620] p-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                  {analysis.level}
                </span>
                <h3 className="mt-1 font-medium text-[#E6EEF8]">{analysis.title}</h3>
                <p className="mt-1 text-sm text-[#8FA3B8]">{analysis.description}</p>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AnalysisListSkeleton() {
  return (
    <ul className="space-y-3">
      {[1, 2, 3].map((i) => (
        <li key={i}>
          <div className="animate-pulse rounded-lg border border-[#1C2430] bg-[#0F1620] p-4">
            <div className="h-4 w-16 rounded bg-[#1C2430]" />
            <div className="mt-2 h-5 w-3/4 rounded bg-[#1C2430]" />
            <div className="mt-2 h-4 w-full rounded bg-[#1C2430]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
```

---

## 3. Component with Mutation + Subscriptions (Create + Schedule Pattern)

```typescript
// src/frontend/components/AuditPage.tsx
'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { mapAnalysisToVulnerability, mapEventToMessage } from '@/src/frontend/lib/auditMappers';

export function AuditPage() {
  const [repoUrl, setRepoUrl] = useState('');
  const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mutation: creates record + schedules action
  const createAndStart = useMutation(api.audits.createAndStart);

  // Subscriptions: skip when no audit is active
  const audit = useQuery(api.audits.get, currentAuditId ? { auditId: currentAuditId } : 'skip');
  const events = useQuery(api.auditEvents.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');
  const analyses = useQuery(api.analyses.listByAudit, currentAuditId ? { auditId: currentAuditId } : 'skip');

  // Derived state: map Convex docs to view models
  const messages = useMemo(() => (events ?? []).map(mapEventToMessage), [events]);
  const vulnerabilities = useMemo(() => (analyses ?? []).map(mapAnalysisToVulnerability), [analyses]);

  const handleStart = async () => {
    setError(null);
    try {
      const result = await createAndStart({ repoUrl });
      setCurrentAuditId(result.auditId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  return (
    <div>
      <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
      <button onClick={handleStart}>Start Audit</button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {audit?.status === 'failed' && <p className="text-sm text-red-400">{audit.error}</p>}
    </div>
  );
}
```

---

## 4. Mapper Pattern (Convex Doc → View Model)

```typescript
// src/frontend/lib/auditMappers.ts
import type { Doc } from '../../../convex/_generated/dataModel';
import type { AgentMessage, Vulnerability } from '../types';

const AGENT_MAP: Record<string, AgentMessage['agent']> = {
  INGESTION: 'ingestion',
  SECURITY_ANALYST: 'security',
  EVALUATOR: 'evaluator',
};

export function mapEventToMessage(event: Doc<'audit_events'>): AgentMessage {
  return {
    id: event._id,
    agent: AGENT_MAP[event.agent] ?? 'security',
    text: event.message,
    timestamp: event._creationTime,
  };
}

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

---

## 5. Presentational Component (Props-Driven)

```typescript
// src/frontend/components/ExamplePanel.tsx
'use client';

import { useState } from 'react';

import { SomeIcon } from 'lucide-react';

import type { SomeType } from '@/src/frontend/types';

interface ExamplePanelProps {
  items: SomeType[];
  onItemClick: (item: SomeType) => void;
}

export function ExamplePanel({ items, onItemClick }: ExamplePanelProps) {
  const [filter, setFilter] = useState<string>('all');

  const filtered = items.filter((item) => filter === 'all' || item.category === filter);

  return (
    <div className="flex h-full flex-col border-r border-[#1C2430] bg-[#0F1620]">
      <div className="border-b border-[#1C2430] p-4">
        <h2 className="text-lg font-semibold text-[#E6EEF8]">Panel Title</h2>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            onClick={() => onItemClick(item)}
            className="cursor-pointer rounded-lg border border-[#1C2430] bg-[#131B26] p-4 transition-all hover:border-[#4DA3FF]/50"
          >
            <h3 className="text-sm font-semibold text-[#E6EEF8]">{item.title}</h3>
            <p className="text-xs text-[#8FA3B8]">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Skeleton Pattern

Colocate skeleton in same file. Keep it simple:

```typescript
function ComponentSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-24 rounded bg-[#1C2430]" />
      <div className="mt-2 h-6 w-full rounded bg-[#1C2430]" />
    </div>
  );
}
```

---

## 7. File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase.tsx` | `AgentFeed.tsx` |
| Colocated skeleton | Inside same file | `AgentFeedSkeleton` |
| Shared UI (future) | `components/ui/` | `Button.tsx`, `Card.tsx` |

---

## 8. When to Split

Extract to separate file when:
- Component exceeds ~150 lines
- Skeleton is reused elsewhere
- Multiple components share the same skeleton

Until then, keep it in one file.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial minimal scaffold for Vibesafe |
| 1.2.0 | 2026-02-21 | Convex integration: replaced pre-Convex mutation template with create+schedule pattern, added mapper pattern template, replaced action template |
| 1.1.0 | 2026-02-21 | Updated for Next.js 16 App Router: `'use client'` directives, corrected import paths, VibeSafe color tokens, added pre-Convex template |
