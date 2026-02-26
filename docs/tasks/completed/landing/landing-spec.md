# Landing Page Port: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect Agent
**Date**: 2026-02-21
**Brief**: docs/tasks/ongoing/landing/landing-brief.md

---

## 1. Overview

Port the landing page from the Gemini Web Studio prototype (`/prototype/src/components/LandingPage.tsx`) into the main Next.js app, restructure routing so the landing page is the homepage (`/`) and the audit dashboard lives at `/roast`, and wire up seamless navigation between them.

### Objective

- Landing page at `/` with CTA that navigates to `/roast?url=<encoded-url>`
- Audit dashboard at `/roast` that auto-starts when a `url` query param is present
- Logo in audit dashboard header links back to `/`

### Constraints

- MUST NOT write tests
- SHOULD refactor during port (Next.js conventions, project lint rules, local assets)
- All existing functionality must be preserved

### Success Criteria

- `pnpm app:compile` passes
- `pnpm app:lint` passes
- `pnpm app:build` succeeds
- `pnpm test:unit:ci` passes (existing tests still green)

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Port LandingPage.tsx to src/frontend/components/ | Writing new tests |
| Create /roast route | Modifying audit dashboard UI |
| Update / route to landing page | Changing Convex backend |
| Download images to /public/ | SEO/metadata optimization |
| Auto-start audit from URL param | Analytics/tracking |
| Logo navigation back to / | Mobile-specific redesign |

---

## 3. Architecture

### 3.1 Route Structure (After)

```
app/
├── layout.tsx          # Unchanged (fonts, providers)
├── globals.css         # Unchanged
├── page.tsx            # NEW: Renders LandingPage
└── roast/
    └── page.tsx        # NEW: Renders SecurityAuditApp with URL param support

src/frontend/components/
├── LandingPage.tsx     # NEW: Ported from prototype
├── SecurityAuditApp.tsx # MODIFIED: accepts initialUrl prop, logo links to /
├── AgentFeed.tsx       # Unchanged
├── DeploymentSafetyChart.tsx # Unchanged
├── VulnerabilitiesPanel.tsx  # Unchanged
└── VulnerabilityModal.tsx    # Unchanged
```

### 3.2 Navigation Flow

```
Landing Page (/)
  └─ User types GitHub URL → clicks "Roast my repo"
     └─ router.push('/roast?url=<encodeURIComponent(url)>')
        └─ app/roast/page.tsx reads searchParams.url
           └─ Passes initialUrl prop to SecurityAuditApp
              └─ Auto-starts audit on mount (useEffect)

Audit Dashboard (/roast)
  └─ User clicks logo
     └─ <Link href="/"> navigates back to landing
```

### 3.3 Local Assets

| Source URL | Local Path | Usage |
|------------|-----------|-------|
| `https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771717020/Roastybara-Logo_gecgsa.png` | `/public/roastybara-logo.png` | Navbar logo (landing + audit) |
| `https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771718640/Roastybara-Character-Hero-transparent_nrn6sj.png` | `/public/roastybara-hero.png` | Hero section character |

---

## 4. Component Changes

### 4.1 LandingPage.tsx (New — Ported from Prototype)

**Refactoring during port:**

1. Add `'use client';` directive (uses `useState`, `useRouter`)
2. Remove `LandingPageProps` interface and `onRoast` prop — component is self-contained
3. Use `useRouter()` from `next/navigation` for navigation
4. Replace `onRoast(url)` calls with `router.push('/roast?url=' + encodeURIComponent(url))`
5. Replace Cloudinary image URLs with local paths (`/roastybara-logo.png`, `/roastybara-hero.png`)
6. Remove `onError` fallback handler on hero image (no need with local assets)
7. Remove `React` default import (React 19 JSX transform)
8. Use function declaration instead of `React.FC` arrow function
9. Export as named export: `export function LandingPage()`

**Preserved as-is:**

- All sections: navbar, hero, how-it-works, LGTM score, catches, agents, why, final CTA, footer
- All Tailwind styling and design tokens
- All lucide-react icon imports
- URL input with Enter key handling
- Both CTA inputs share the same state and handler

### 4.2 SecurityAuditApp.tsx (Modified)

**Changes:**

1. Add optional `initialUrl` prop: `{ initialUrl?: string }`
2. Initialize `repoUrl` state: `useState(initialUrl ?? '')`
3. Add `useEffect` that calls `handleStartAudit()` on mount when `initialUrl` is present
4. Import `Link` from `next/link`
5. Wrap logo `<div>` with `<Link href="/">` so clicking the logo navigates home
6. Export remains `export default function SecurityAuditApp`

**`useEffect` for auto-start:**

```typescript
const hasAutoStarted = useRef(false);

useEffect(() => {
  if (initialUrl && !hasAutoStarted.current) {
    hasAutoStarted.current = true;
    handleStartAudit();
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Uses a ref guard to prevent double-start in React StrictMode.

### 4.3 app/page.tsx (Modified)

Replace current SecurityAuditApp render with LandingPage:

```typescript
import { LandingPage } from '@/src/frontend/components/LandingPage';

export default function Home() {
  return <LandingPage />;
}
```

### 4.4 app/roast/page.tsx (New)

Server component that reads `searchParams` and passes to SecurityAuditApp:

```typescript
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

---

## 5. Dependency Check

### 5.1 Already Available

- `lucide-react` — Used by current components
- `next/navigation` (`useRouter`) — Part of Next.js
- `next/link` (`Link`) — Part of Next.js
- Tailwind CSS 4 — Already configured
- Syne font — Already loaded in layout.tsx via `next/font/google`

### 5.2 Needs Verification

- **`tailwindcss-animate`** — The landing page uses animation classes (`animate-in`, `fade-in`, `slide-in-from-bottom-4`, etc.). The current SecurityAuditApp history drawer also uses `animate-in slide-in-from-right`. Check if the plugin is installed; if not, install it or replace animations with standard Tailwind transitions.

---

## 6. Prompt Execution Strategy

### Phase 1: Asset & Dependency Preparation

> Gate: Images exist in /public/ and dependencies are satisfied

#### Step 1.1: Download Images to /public/

Download the two Cloudinary images to the project's `/public/` directory:

1. Download `https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771717020/Roastybara-Logo_gecgsa.png` and save as `/public/roastybara-logo.png`
2. Download `https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771718640/Roastybara-Character-Hero-transparent_nrn6sj.png` and save as `/public/roastybara-hero.png`

Use `curl -o` to download each file.

##### Verify

- `test -f public/roastybara-logo.png && echo "Logo exists"`
- `test -f public/roastybara-hero.png && echo "Hero exists"`

##### Timeout

30000

#### Step 1.2: Verify Animation Dependencies

Check if `tailwindcss-animate` is listed in `package.json`. The landing page and existing components use `animate-in`, `fade-in`, `slide-in-from-bottom-*`, `slide-in-from-right-*` classes.

If it is NOT installed, install it with `pnpm add tailwindcss-animate` and add it to the Tailwind CSS config (check `tailwind.config.ts` or `postcss.config.*` for the appropriate place to add the plugin). If it IS already installed or the animations are handled by another mechanism, do nothing.

##### Verify

- `pnpm app:compile`

##### Timeout

60000

### Phase 2: Port Landing Page Component

> Gate: `pnpm app:compile`

#### Step 2.1: Create LandingPage.tsx

Read `/prototype/src/components/LandingPage.tsx` for reference.

Create `src/frontend/components/LandingPage.tsx` by porting the prototype with these refactoring changes:

1. First line: `'use client';`
2. Remove `import React, { useState } from 'react';` — instead use `import { useState } from 'react';`
3. Add `import { useRouter } from 'next/navigation';`
4. Keep all lucide-react icon imports exactly as they are in the prototype: `{ Sparkles, ArrowRight, Flame, Search, CheckCircle2, AlertTriangle, Terminal, Bot, Shield, Zap }`
   - Note: Remove any icons from the import that are not actually used in the JSX (check if `Sparkles` and `Bot` are used)
5. Remove `interface LandingPageProps` and `onRoast` prop
6. Change signature from `export const LandingPage: React.FC<LandingPageProps> = ({ onRoast }) =>` to `export function LandingPage()`
7. Add `const router = useRouter();` inside the function body
8. Change `handleRoast` function to: `router.push('/roast?url=' + encodeURIComponent(url));`
9. Replace ALL occurrences of the Cloudinary logo URL (`https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771717020/Roastybara-Logo_gecgsa.png`) with `/roastybara-logo.png`
10. Replace the Cloudinary hero URL (`https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771718640/Roastybara-Character-Hero-transparent_nrn6sj.png`) with `/roastybara-hero.png`
11. Remove the `onError` handler on the hero `<img>` tag entirely (lines 100-104 in prototype)
12. Keep ALL Tailwind classes, sections, and layout exactly as they are in the prototype
13. Make sure `handleRoast` checks `url.trim()` before navigating (as in prototype)

Do NOT add comments, docstrings, or type annotations beyond what's necessary.

##### Verify

- `pnpm app:compile`
- `pnpm app:lint`

##### Timeout

120000

### Phase 3: Route Restructure

> Gate: `pnpm app:compile && pnpm app:lint`

#### Step 3.1: Create app/roast/page.tsx

Create the file `app/roast/page.tsx` as a server component:

```typescript
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

This reads the `url` search parameter server-side and passes it as a prop to the client component.

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.2: Update app/page.tsx

Replace the contents of `app/page.tsx` with:

```typescript
import { LandingPage } from '@/src/frontend/components/LandingPage';

export default function Home() {
  return <LandingPage />;
}
```

Remove the old `SecurityAuditApp` import.

##### Verify

- `pnpm app:compile`

##### Timeout

60000

#### Step 3.3: Update SecurityAuditApp for URL Param and Logo Navigation

Read `src/frontend/components/SecurityAuditApp.tsx`.

Make these changes:

1. **Add prop type**: Change the function signature from `export default function SecurityAuditApp()` to `export default function SecurityAuditApp({ initialUrl }: { initialUrl?: string })`.

2. **Initialize repoUrl from prop**: Change `const [repoUrl, setRepoUrl] = useState('');` to `const [repoUrl, setRepoUrl] = useState(initialUrl ?? '');`.

3. **Add auto-start effect**: Add these imports if not present: `useRef`, `useEffect`. Then add:
   ```typescript
   const hasAutoStarted = useRef(false);

   useEffect(() => {
     if (initialUrl && !hasAutoStarted.current) {
       hasAutoStarted.current = true;
       handleStartAudit();
     }
   }, []); // eslint-disable-line react-hooks/exhaustive-deps
   ```
   Place this after the `handleStartAudit` function definition so it can reference it.

4. **Logo links home**: Add `import Link from 'next/link';` to imports. Wrap the logo container (the `<div className="flex items-center gap-3">` in the header) with `<Link href="/">...</Link>`. Apply the existing group/cursor classes to the Link instead.

5. **Also update the Cloudinary logo URL** in the header `<img>` tag to use `/roastybara-logo.png` (local asset).

Do NOT change anything else in the component. Preserve all existing Convex integration, error handling, history drawer, etc.

##### Verify

- `pnpm app:compile`
- `pnpm app:lint`

##### Timeout

120000

### Phase 4: Final Verification

> Gate: `pnpm app:build`

#### Step 4.1: Full Build and Test

Run the complete verification suite to confirm everything works:

1. TypeScript compilation
2. Lint
3. Production build
4. Unit tests (existing tests must still pass)

If any step fails, fix the issue before proceeding.

##### Verify

- `pnpm app:compile`
- `pnpm app:lint`
- `pnpm app:build`
- `pnpm test:unit:ci`

##### Timeout

180000

---

## 7. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-21 | Initial specification |
