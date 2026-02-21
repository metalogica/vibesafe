# Frontend Prototype Port: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect Agent
**Date**: 2026-02-21

---

## 1. Overview

### Objective

Port the Gemini AI Web Studio prototype from `/prototype/src/` into the Next.js 16 App Router project at `src/frontend/`, refactoring during the port to align with project conventions (extracted types, mock data, `cn()` utility, `next/font/google`).

### Constraints

- No tests required
- App must build (`pnpm app:build`)
- TypeScript must compile (`pnpm app:compile`)
- All components are client-side (mock data only, no backend)
- Must follow project lint rules: no barrel exports, sorted exports, import ordering, unused vars prefixed with `_`

### Success Criteria

- `pnpm app:compile` passes
- `pnpm app:build` passes
- All 5 prototype components are ported and rendering
- Types and mock data extracted into separate files

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Port 5 prototype components to `src/frontend/` | Backend/Convex integration |
| Install `lucide-react`, `motion`, `recharts`, `clsx`, `tailwind-merge` | Tests |
| Extract shared types to `src/frontend/types.ts` | Replacing hardcoded hex colors with theme tokens in JSX |
| Extract mock data to `src/frontend/data/mockAuditData.ts` | Mobile responsiveness improvements |
| Create `cn()` utility at `src/frontend/lib/cn.ts` | Performance optimization |
| Update `app/globals.css` with VibeSafe theme tokens | SEO |
| Convert Syne font to `next/font/google` in `app/layout.tsx` | |
| Update `app/page.tsx` to render `SecurityAuditApp` | |

---

## 3. Target File Structure

```
src/frontend/
├── components/
│   ├── AgentFeed.tsx              # Agent activity feed (from AgentDiscussion.tsx)
│   ├── DeploymentSafetyChart.tsx  # Recharts line chart
│   ├── SecurityAuditApp.tsx       # Main orchestrating component
│   ├── VulnerabilitiesPanel.tsx   # Left sidebar vulnerabilities list
│   └── VulnerabilityModal.tsx     # Vulnerability detail modal
├── data/
│   └── mockAuditData.ts           # Mock vulnerabilities + scenarios
├── lib/
│   └── cn.ts                      # clsx + tailwind-merge utility
└── types.ts                       # Shared TypeScript types
```

Modified existing files:
- `app/globals.css` — Add VibeSafe theme tokens
- `app/layout.tsx` — Add Syne font via `next/font/google`, update metadata
- `app/page.tsx` — Render `SecurityAuditApp`
- `package.json` — New dependencies (via pnpm install)

---

## 4. Type Definitions

All shared types extracted to `src/frontend/types.ts`:

```typescript
export type AgentRole = 'retriever' | 'security' | 'evaluator';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type SeverityFilter = 'all' | Severity;

export type AuditStatus = 'idle' | 'auditing' | 'ready';

export interface AgentMessage {
  id: string;
  agent: AgentRole;
  text: string;
  belief?: number;
  timestamp: number;
}

export interface Vulnerability {
  id: string;
  title: string;
  file: string;
  severity: Severity;
  description: string;
  impact: string;
  fix: string;
  status: 'open' | 'fixed';
  commitDetected: string;
}

export interface AuditSnapshot {
  hash: string;
  consensus: number;
  messages: AgentMessage[];
  vulnerabilities: Vulnerability[];
}

export interface CommitData {
  hash: string;
  consensus: number;
  vulnerabilityCount: number;
}
```

---

## 5. Mock Data

Extracted to `src/frontend/data/mockAuditData.ts`:

- `generateCommitHash()` — Random 8-char hex string
- `INITIAL_VULNERABILITIES: Vulnerability[]` — 5 hardcoded vulnerabilities (SEC-A-001 through SEC-A-007)
- `AUDIT_SCENARIO_MESSAGES` — Array of `{ agent, text, belief?, delay }` objects for initial audit simulation
- `FIX_SCENARIO_MESSAGES` — Array for fix simulation

All imports reference `../types` for type safety.

---

## 6. Component Adaptations

### 6.1 All Components

- Add `'use client';` as first line (all use hooks or browser APIs)
- Import types from `@/src/frontend/types`
- Import mock data from `@/src/frontend/data/mockAuditData` where needed
- Follow project import ordering: third-party first, then `@/` aliases, then relative

### 6.2 AgentFeed.tsx (was AgentDiscussion.tsx)

- Rename file from `AgentDiscussion.tsx` to `AgentFeed.tsx`
- Remove type exports (they move to `types.ts`)
- Import `AgentMessage` from `@/src/frontend/types`
- Keep `motion/react` animations as-is
- Export only `AgentFeed` component (named export)

### 6.3 VulnerabilitiesPanel.tsx

- Remove `Vulnerability` interface export (moves to `types.ts`)
- Import `Vulnerability`, `SeverityFilter` from `@/src/frontend/types`
- Keep component logic as-is
- Export only `VulnerabilitiesPanel` component (named export)

### 6.4 VulnerabilityModal.tsx

- Change `import { Vulnerability } from './VulnerabilitiesPanel'` → `import { Vulnerability } from '@/src/frontend/types'`
- Keep `motion/react` animations as-is
- Export only `VulnerabilityModal` component (named export)

### 6.5 DeploymentSafetyChart.tsx

- Remove `CommitData` interface (moves to `types.ts`)
- Import `CommitData` from `@/src/frontend/types`
- Keep `recharts` usage as-is
- Export only `DeploymentSafetyChart` component (named export)

### 6.6 SecurityAuditApp.tsx

- Remove all type definitions (use `types.ts`)
- Remove all mock data constants (use `mockAuditData.ts`)
- Import types from `@/src/frontend/types`
- Import mock data from `@/src/frontend/data/mockAuditData`
- Import child components from relative paths (`./AgentFeed`, etc.)
- Keep state management logic as-is
- Export as default export

---

## 7. CSS & Font Changes

### 7.1 globals.css

Add VibeSafe theme tokens to the existing `@theme inline` block:

```css
--font-display: var(--font-syne), sans-serif;
--color-bg-dark: #0B0F14;
--color-panel-dark: #0F1620;
--color-divider-dark: #1C2430;
--color-accent-blue: #4DA3FF;
--color-text-primary: #E6EEF8;
--color-text-secondary: #8FA3B8;
```

Remove the light-mode `:root` variables and the `@media (prefers-color-scheme: dark)` block. Replace with dark-mode-only values. Update `body` styles to use the VibeSafe background and font.

### 7.2 layout.tsx

Add Syne font via `next/font/google`:

```typescript
import { Syne } from 'next/font/google';

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
});
```

Add `syne.variable` to the body className. Update metadata title to "VibeSafe" and description to "AI-powered security audits for codebases."

---

## 8. Page Integration

### 8.1 app/page.tsx

Replace entire contents with:

```typescript
import SecurityAuditApp from '@/src/frontend/components/SecurityAuditApp';

export default function Home() {
  return <SecurityAuditApp />;
}
```

This is a server component that renders the client `SecurityAuditApp`.

---

## 9. Prompt Execution Strategy

### Phase 1: Infrastructure

> Gate: `pnpm app:compile`

#### Step 1.1: Install Dependencies

Run the following command to install all required dependencies:

```bash
pnpm add lucide-react motion recharts clsx tailwind-merge
```

These are the dependencies used by the prototype components:
- `lucide-react` — Icon library
- `motion` — Animation library (Motion v12+, imported as `motion/react`)
- `recharts` — Charting library
- `clsx` — Conditional class utility
- `tailwind-merge` — Tailwind class merging

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 1.2: Create cn() Utility

Create `src/frontend/lib/cn.ts` with the following content:

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

This is the standard `cn()` utility combining `clsx` and `tailwind-merge`.

##### Verify

- `pnpm app:compile`

##### Timeout

30000

#### Step 1.3: Update globals.css

Read the current `app/globals.css`. Replace its entire contents with:

```css
@import "tailwindcss";

@theme inline {
  --color-background: #0B0F14;
  --color-foreground: #E6EEF8;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-syne), sans-serif;
  --color-bg-dark: #0B0F14;
  --color-panel-dark: #0F1620;
  --color-divider-dark: #1C2430;
  --color-accent-blue: #4DA3FF;
  --color-text-primary: #E6EEF8;
  --color-text-secondary: #8FA3B8;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}
```

Key changes:
- Dark mode only — removed light mode `:root` and media query
- Added VibeSafe color tokens as Tailwind theme values
- Added `--font-display` referencing the Syne font CSS variable
- Background is now `#0B0F14` (VibeSafe dark bg)

##### Verify

- `pnpm app:compile`

##### Timeout

30000

#### Step 1.4: Update layout.tsx

Read the current `app/layout.tsx`. Update it to:

1. Add `Syne` import from `next/font/google`
2. Create Syne font instance with `variable: '--font-syne'` and `subsets: ['latin']`
3. Add `syne.variable` to the body className alongside existing font variables
4. Update `metadata.title` to `'VibeSafe'`
5. Update `metadata.description` to `'AI-powered security audits for codebases'`

The resulting file should look like:

```typescript
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Syne } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'VibeSafe',
  description: 'AI-powered security audits for codebases',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

##### Verify

- `pnpm app:compile`

##### Timeout

30000

### Phase 2: Types & Mock Data

> Gate: `pnpm app:compile`

#### Step 2.1: Create Shared Types

Create `src/frontend/types.ts` with all shared TypeScript types extracted from the prototype. Read the following prototype files for reference:

- `prototype/src/components/AgentDiscussion.tsx` — `AgentMessage` interface
- `prototype/src/components/VulnerabilitiesPanel.tsx` — `Vulnerability` interface
- `prototype/src/components/DeploymentSafetyChart.tsx` — `CommitData` interface
- `prototype/src/components/SecurityAuditApp.tsx` — `AuditSnapshot` interface

The file must export these types:

```typescript
export type AgentRole = 'retriever' | 'security' | 'evaluator';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type SeverityFilter = 'all' | Severity;
export type AuditStatus = 'idle' | 'auditing' | 'ready';

export interface AgentMessage {
  id: string;
  agent: AgentRole;
  text: string;
  belief?: number;
  timestamp: number;
}

export interface Vulnerability {
  id: string;
  title: string;
  file: string;
  severity: Severity;
  description: string;
  impact: string;
  fix: string;
  status: 'open' | 'fixed';
  commitDetected: string;
}

export interface AuditSnapshot {
  hash: string;
  consensus: number;
  messages: AgentMessage[];
  vulnerabilities: Vulnerability[];
}

export interface CommitData {
  hash: string;
  consensus: number;
  vulnerabilityCount: number;
}
```

Use named exports only (no barrel exports). Exports must be in alphabetical order per project lint rules.

##### Verify

- `pnpm app:compile`

##### Timeout

30000

#### Step 2.2: Create Mock Data

Create `src/frontend/data/mockAuditData.ts` with all mock data extracted from `prototype/src/components/SecurityAuditApp.tsx`.

Read the prototype's `SecurityAuditApp.tsx` and extract:

1. `generateCommitHash()` function — Generates random 8-char hex string using `Math.random().toString(36).substring(2, 10)`
2. `INITIAL_VULNERABILITIES` — Array of 5 `Vulnerability` objects (SEC-A-001, SEC-A-002, SEC-A-003, SEC-A-004, SEC-A-007). Copy exact content from the prototype.
3. `AUDIT_SCENARIO_MESSAGES` — Array of 7 message objects with `{ agent, text, belief?, delay }` fields. Copy exact content.
4. `FIX_SCENARIO_MESSAGES` — Array of 5 message objects. Copy exact content.

The file must:
- Import `Vulnerability` from `@/src/frontend/types`
- Use named exports for all four items
- Keep `delay` field in the scenario messages even though it's not used yet (it's metadata)
- Define a `ScenarioMessage` type locally: `{ agent: string; text: string; belief?: number; delay: number }`
- Exports alphabetically sorted

##### Verify

- `pnpm app:compile`

##### Timeout

30000

### Phase 3: Port Components

> Gate: `pnpm app:compile` and `pnpm app:build`

#### Step 3.1: Port DeploymentSafetyChart

Create `src/frontend/components/DeploymentSafetyChart.tsx`.

Read the prototype file at `prototype/src/components/DeploymentSafetyChart.tsx` and port it with these changes:

1. Add `'use client';` as the first line
2. Remove the `CommitData` interface definition — import it from `@/src/frontend/types`
3. Keep `DeploymentSafetyChartProps` interface local (it's component-specific)
4. Keep the `CustomTooltip` component as-is (it's a local helper)
5. Keep all `recharts` imports as-is
6. Use named export: `export function DeploymentSafetyChart(...)` (not `export const`)
7. The `CustomTooltip` uses `any` types for its props — keep that (recharts typing limitation)

Import order:
1. `'use client';`
2. React (if needed — check if any React APIs are used directly)
3. `recharts` imports
4. `@/src/frontend/types` imports

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.2: Port AgentFeed

Create `src/frontend/components/AgentFeed.tsx`.

Read the prototype file at `prototype/src/components/AgentDiscussion.tsx` and port it with these changes:

1. Add `'use client';` as the first line
2. Rename file from `AgentDiscussion.tsx` to `AgentFeed.tsx`
3. Remove the `AgentMessage` interface export — import it from `@/src/frontend/types`
4. Keep `AgentFeedProps` interface local
5. Keep all `lucide-react` imports as-is
6. Keep `motion/react` imports as-is (`motion`, `AnimatePresence`)
7. Use named export: `export function AgentFeed(...)` instead of `export const AgentFeed: React.FC<...> = ...`
8. Remove explicit `React.FC` typing — use regular function with typed props parameter
9. Import `React` only if `useEffect` or `useRef` are used (they are — import `{ useEffect, useRef }` from `'react'`)

Import order:
1. `'use client';`
2. `{ useEffect, useRef }` from `'react'`
3. lucide-react icons
4. `{ AnimatePresence, motion }` from `'motion/react'`
5. `{ AgentMessage }` from `'@/src/frontend/types'`

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.3: Port VulnerabilitiesPanel

Create `src/frontend/components/VulnerabilitiesPanel.tsx`.

Read the prototype file at `prototype/src/components/VulnerabilitiesPanel.tsx` and port it with these changes:

1. Add `'use client';` as the first line
2. Remove the `Vulnerability` interface export — import from `@/src/frontend/types`
3. Also import `SeverityFilter` from `@/src/frontend/types`
4. Keep `VulnerabilitiesPanelProps` local, but update the `filter` and `setFilter` types to use `SeverityFilter`
5. Keep all `lucide-react` imports as-is
6. Use named export: `export function VulnerabilitiesPanel(...)` instead of `export const`
7. Remove explicit `React.FC` typing

Import order:
1. `'use client';`
2. lucide-react icons
3. types from `'@/src/frontend/types'`

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.4: Port VulnerabilityModal

Create `src/frontend/components/VulnerabilityModal.tsx`.

Read the prototype file at `prototype/src/components/VulnerabilityModal.tsx` and port it with these changes:

1. Add `'use client';` as the first line
2. Change `import { Vulnerability } from './VulnerabilitiesPanel'` → `import { type Vulnerability } from '@/src/frontend/types'`
3. Keep `VulnerabilityModalProps` interface local
4. Keep `motion/react` imports as-is
5. Keep all `lucide-react` imports as-is
6. Use named export: `export function VulnerabilityModal(...)` instead of `export const`
7. Remove explicit `React.FC` typing
8. Replace `React.useState` and `React.useEffect` with direct imports from `'react'`

Import order:
1. `'use client';`
2. `{ useEffect, useState }` from `'react'`
3. lucide-react icons
4. `{ AnimatePresence, motion }` from `'motion/react'`
5. `{ type Vulnerability }` from `'@/src/frontend/types'`

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.5: Port SecurityAuditApp

Create `src/frontend/components/SecurityAuditApp.tsx`.

Read the prototype file at `prototype/src/components/SecurityAuditApp.tsx` and port it with these changes:

1. Add `'use client';` as the first line
2. Remove ALL type definitions — import from `@/src/frontend/types`:
   - `AgentMessage`, `AuditSnapshot`, `AuditStatus`, `CommitData`, `SeverityFilter`, `Vulnerability`
3. Remove ALL mock data constants — import from `@/src/frontend/data/mockAuditData`:
   - `AUDIT_SCENARIO_MESSAGES`, `FIX_SCENARIO_MESSAGES`, `INITIAL_VULNERABILITIES`, `generateCommitHash`
4. Update child component imports to use relative paths:
   - `import { AgentFeed } from './AgentFeed'` (was `./AgentDiscussion`)
   - `import { DeploymentSafetyChart } from './DeploymentSafetyChart'`
   - `import { VulnerabilitiesPanel } from './VulnerabilitiesPanel'`
   - `import { VulnerabilityModal } from './VulnerabilityModal'`
5. Keep `lucide-react` imports as-is
6. Keep the component as `export default function SecurityAuditApp()` (default export because page.tsx imports it as default)
7. Keep ALL state management and simulation logic EXACTLY as in the prototype — do not refactor the internal logic
8. The `createMessage` function's `data: any` parameter should be typed. Use the `ScenarioMessage` type from mockAuditData or define inline. Alternatively, keep `any` for now.
9. Fix the `intervalRef` type: use `ReturnType<typeof setInterval> | null` instead of `NodeJS.Timeout | null` for browser compatibility

Import order:
1. `'use client';`
2. `{ useEffect, useRef, useState }` from `'react'`
3. lucide-react icons (alphabetical)
4. child component imports (alphabetical)
5. `@/src/frontend/data/mockAuditData` imports
6. `@/src/frontend/types` imports

##### Verify

- `pnpm app:compile`

##### Timeout

120000

#### Step 3.6: Update app/page.tsx

Replace the entire contents of `app/page.tsx` with:

```typescript
import SecurityAuditApp from '@/src/frontend/components/SecurityAuditApp';

export default function Home() {
  return <SecurityAuditApp />;
}
```

This is a server component that renders the client-side `SecurityAuditApp`. No `'use client'` directive needed on the page itself.

##### Verify

- `pnpm app:compile`
- `pnpm app:build`

##### Timeout

120000
