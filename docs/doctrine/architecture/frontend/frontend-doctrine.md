# Frontend Doctrine (Vite + React + Convex)

**Version**: 1.0.0
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
| Framework | React 19 |
| Bundler | Vite |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| Charts | Recharts |
| Animation | Motion |
| Backend | Convex (real-time) |

---

## 3. Directory Structure

```
src/
├── main.tsx                 # App entry
├── App.tsx                  # Root component + Convex provider
├── index.css                # Tailwind imports
│
├── components/              # Reusable UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Badge.tsx
│   └── ...
│
├── pages/                   # Page components
│   └── Dashboard.tsx
│
├── hooks/                   # Custom hooks (if needed)
│   └── useAuditPolling.ts
│
└── lib/                     # Utilities
    ├── cn.ts                # clsx + tailwind-merge
    └── constants.ts
```

Flat structure. No feature folders, no DI, no repositories. Extract when complexity demands it.

---

## 4. Convex Integration

### 4.1 Provider Setup

```typescript
// src/App.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <Dashboard />
    </ConvexProvider>
  );
}
```

### 4.2 Queries (Real-time by Default)

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function AnalysisFeed({ auditId }: { auditId: Id<"audits"> }) {
  // Automatically updates when data changes
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

### 4.3 Mutations

```typescript
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function StartAuditButton({ repoUrl }: { repoUrl: string }) {
  const createAudit = useMutation(api.audits.create);

  const handleClick = async () => {
    const auditId = await createAudit({ repoUrl, commitHash: "HEAD" });
    // Navigate or update UI
  };

  return <Button onClick={handleClick}>Start Audit</Button>;
}
```

### 4.4 Actions (External APIs)

```typescript
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

function RunAnalysisButton({ auditId }: { auditId: Id<"audits"> }) {
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
      {isRunning ? "Analyzing..." : "Run Analysis"}
    </Button>
  );
}
```

---

## 5. Component Patterns

### 5.1 Utility: `cn()`

```typescript
// src/lib/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 5.2 Basic Component

```typescript
// src/components/Badge.tsx
import { cn } from "@/lib/cn";

type Severity = "low" | "medium" | "high" | "critical";

const severityStyles: Record<Severity, string> = {
  low: "bg-gray-500/20 text-gray-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

interface BadgeProps {
  severity: Severity;
  children: React.ReactNode;
}

export function Badge({ severity, children }: BadgeProps) {
  return (
    <span className={cn("px-2 py-1 rounded text-xs font-medium", severityStyles[severity])}>
      {children}
    </span>
  );
}
```

### 5.3 Card Component

```typescript
// src/components/Card.tsx
import { cn } from "@/lib/cn";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn("bg-gray-900 border border-gray-800 rounded-lg p-4", className)}>
      {children}
    </div>
  );
}
```

### 5.4 Loading States

```typescript
// Pattern: undefined = loading, null = not found, data = ready
const audit = useQuery(api.audits.get, { auditId });

if (audit === undefined) return <AuditSkeleton />;
if (audit === null) return <NotFound />;
return <AuditDetail audit={audit} />;
```

MUST handle all three states. MUST NOT render stale data as if current.

---

## 6. Styling Rules

### 6.1 Tailwind Conventions

| Element | Pattern |
|---------|---------|
| Background | `bg-gray-900` (cards), `bg-gray-950` (page) |
| Borders | `border-gray-800` |
| Text primary | `text-gray-100` |
| Text secondary | `text-gray-400` |
| Accent | `text-green-400` (safe), `text-red-400` (unsafe) |

### 6.2 Dark Mode

App is dark mode only. MUST NOT include light mode styles.

### 6.3 Responsive

Mobile-first. Use `sm:`, `md:`, `lg:` prefixes for larger screens.

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

## 7. State Management

### 7.1 Server State

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

### 7.2 UI State

Local UI state (modals, tabs, form inputs) uses `useState`:

```typescript
const [activeTab, setActiveTab] = useState<"all" | "critical">("all");
const [repoUrl, setRepoUrl] = useState("");
```

### 7.3 Form State

For the repo URL input, simple `useState` is sufficient:

```typescript
function RepoInput({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onSubmit(url.trim());
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
      />
      <Button type="submit">Start Audit</Button>
    </form>
  );
}
```

---

## 8. Error Handling

### 8.1 Query Errors

Convex queries don't throw by default. Handle missing data:

```typescript
const audit = useQuery(api.audits.get, { auditId });

if (audit === undefined) return <Loading />;
if (audit === null) return <div>Audit not found</div>;
```

### 8.2 Mutation Errors

Mutations can throw. Wrap in try/catch:

```typescript
const createAudit = useMutation(api.audits.create);

const handleSubmit = async () => {
  try {
    await createAudit({ repoUrl, commitHash });
  } catch (error) {
    toast.error("Failed to create audit");
  }
};
```

### 8.3 Action Errors

Actions return structured results (per database doctrine):

```typescript
const result = await runAnalysis({ auditId });
if (!result.success) {
  toast.error(result.error.message);
}
```

---

## 9. File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `PascalCase.tsx` | `AuditCard.tsx` |
| Hook | `use{Name}.ts` | `useAuditStatus.ts` |
| Utility | `camelCase.ts` | `formatDate.ts` |
| Constants | `camelCase.ts` | `constants.ts` |
| Types | Colocate in component or `types.ts` | — |

---

## 10. Testing

### 10.1 Component Tests

Use Vitest + React Testing Library:

```typescript
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

test("renders critical badge with correct style", () => {
  render(<Badge severity="critical">SEC-001</Badge>);

  const badge = screen.getByText("SEC-001");
  expect(badge).toHaveClass("text-red-400");
});
```

### 10.2 Integration Tests

For components using Convex, mock the hooks:

```typescript
import { vi } from "vitest";
import * as convexReact from "convex/react";

vi.spyOn(convexReact, "useQuery").mockReturnValue([
  { _id: "1", title: "Test Analysis", level: "critical" },
]);
```

---

## 11. Performance

### 11.1 Query Granularity

Prefer multiple small queries over one large query:

```typescript
// ✓ GOOD: components subscribe to what they need
const audit = useQuery(api.audits.get, { auditId });
const analyses = useQuery(api.analyses.listByAudit, { auditId });
const evaluation = useQuery(api.evaluations.getByAudit, { auditId });

// ✗ AVOID: one mega-query that returns everything
const everything = useQuery(api.audits.getWithAllRelations, { auditId });
```

### 11.2 Conditional Queries

Skip queries when data isn't needed:

```typescript
// Only fetch when audit is complete
const evaluation = useQuery(
  api.evaluations.getByAudit,
  audit?.status === "complete" ? { auditId } : "skip"
);
```

---

## 12. Future Extraction Path

If Vibesafe grows:

1. **Multiple pages** → Add React Router, create `pages/` directory
2. **Shared component library** → Extract to `components/ui/` with Storybook
3. **Complex forms** → Add React Hook Form + Zod
4. **Global UI state** → Add Zustand for modals, toasts, sidebar

This is a refactor, not a rewrite.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial minimal frontend doctrine for Vibesafe |

