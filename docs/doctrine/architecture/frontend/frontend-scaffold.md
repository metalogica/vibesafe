# Frontend Component Scaffold (Convex)

**Version**: 1.0.0
**Status**: Reference
**Date**: 2026-02-21
**App**: Vibesafe

---

## 1. Purpose

Copy-paste templates for creating components. Minimal structure — no DI, no repositories, no Container/UI split.

---

## 2. Basic Component with Query

```typescript
// src/components/AnalysisList.tsx
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Card } from "./Card";
import { Badge } from "./Badge";

interface AnalysisListProps {
  auditId: Id<"audits">;
}

export function AnalysisList({ auditId }: AnalysisListProps) {
  const analyses = useQuery(api.analyses.listByAudit, { auditId });

  // Loading
  if (analyses === undefined) {
    return <AnalysisListSkeleton />;
  }

  // Empty
  if (analyses.length === 0) {
    return <p className="text-gray-400">No vulnerabilities found.</p>;
  }

  // Data
  return (
    <ul className="space-y-3">
      {analyses.map((analysis) => (
        <li key={analysis._id}>
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <Badge severity={analysis.level}>{analysis.level}</Badge>
                <h3 className="mt-1 font-medium text-gray-100">{analysis.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{analysis.description}</p>
              </div>
            </div>
          </Card>
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
          <Card className="animate-pulse">
            <div className="h-4 w-16 rounded bg-gray-700" />
            <div className="mt-2 h-5 w-3/4 rounded bg-gray-700" />
            <div className="mt-2 h-4 w-full rounded bg-gray-700" />
          </Card>
        </li>
      ))}
    </ul>
  );
}
```

---

## 3. Component with Mutation

```typescript
// src/components/StartAuditForm.tsx
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./Button";

interface StartAuditFormProps {
  onSuccess?: (auditId: string) => void;
}

export function StartAuditForm({ onSuccess }: StartAuditFormProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createAudit = useMutation(api.audits.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const auditId = await createAudit({
        repoUrl: repoUrl.trim(),
        commitHash: "HEAD"
      });
      setRepoUrl("");
      onSuccess?.(auditId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create audit");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="url"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        className="flex-1 rounded bg-gray-800 border border-gray-700 px-3 py-2 text-gray-100"
        required
      />
      <Button type="submit">Start Audit</Button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  );
}
```

---

## 4. Component with Action (External API)

```typescript
// src/components/RunAnalysisButton.tsx
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";

interface RunAnalysisButtonProps {
  auditId: Id<"audits">;
}

export function RunAnalysisButton({ auditId }: RunAnalysisButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runAnalysis = useAction(api.services.auditService.runAnalysis);

  const handleClick = async () => {
    setIsRunning(true);
    setError(null);

    const result = await runAnalysis({ auditId });

    if (!result.success) {
      setError(result.error.message);
    }

    setIsRunning(false);
  };

  return (
    <div>
      <Button onClick={handleClick} disabled={isRunning}>
        {isRunning ? "Analyzing..." : "Run Analysis"}
      </Button>
      {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
```

---

## 5. Skeleton Pattern

Colocate skeleton in same file. Keep it simple:

```typescript
function ComponentSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-24 rounded bg-gray-700" />
      <div className="mt-2 h-6 w-full rounded bg-gray-700" />
    </div>
  );
}
```

---

## 6. File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase.tsx` | `AnalysisList.tsx` |
| Colocated skeleton | Inside same file | `AnalysisListSkeleton` |
| Shared UI | `components/` | `Button.tsx`, `Card.tsx`, `Badge.tsx` |

---

## 7. When to Split

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
