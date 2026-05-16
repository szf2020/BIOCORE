# FUXA Replacement — Sub-project 1/8: SVG Canvas Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only SVG renderer that mounts an `<svg>` from `scada_views.widgets` JSON, dispatches each item to a SVG widget component, and re-renders on PLC tag changes.

**Architecture:** Three layers — `ScadaCanvas` (root `<svg>` + zod validation + zIndex sort), `SvgWidgetInstance` (per-item `<g>` wrapper + `useTag` subscription + ErrorBoundary), `SvgWidget` (pure SVG primitives). Legacy React widgets at `/scada/[viewId]` coexist; new SVG runtime mounts at `/scada2/[viewId]` until sub-project 7 deletes legacy.

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · zod · zustand (existing realtime-store + useTag) · vitest 1.6 + @testing-library/react 14 + jsdom · better-sqlite3 (server migrations).

**Spec:** [/docs/superpowers/specs/2026-05-15-fuxa-replacement-svg-canvas-runtime-design.md](../specs/2026-05-15-fuxa-replacement-svg-canvas-runtime-design.md)

**Branch:** feat/scada-data-model

**Total tests:** 33 (Unit 10 + Component 17 + Integration 6)

---

## File Structure (locked before tasks)

**New (web-ui):**
- `packages/web-ui/src/widgets/svg/types.ts` — schemas + interfaces
- `packages/web-ui/src/widgets/svg/registry.ts` — SVG widget registry
- `packages/web-ui/src/widgets/svg/SvgLabel.tsx` — plumbing widget
- `packages/web-ui/src/widgets/svg/SvgRect.tsx` — plumbing widget
- `packages/web-ui/src/widgets/svg/index.ts` — barrel + self-register
- `packages/web-ui/src/widgets/svg/__tests__/registry.test.ts`
- `packages/web-ui/src/widgets/svg/__tests__/SvgLabel.test.tsx`
- `packages/web-ui/src/widgets/svg/__tests__/SvgRect.test.tsx`
- `packages/web-ui/src/widgets/svg/__tests__/fixtures.ts`
- `packages/web-ui/src/components/scada/SvgErrorBoundary.tsx`
- `packages/web-ui/src/components/scada/ViewErrorDisplay.tsx`
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- `packages/web-ui/src/components/scada/ScadaCanvas.tsx`
- `packages/web-ui/src/components/scada/__tests__/SvgErrorBoundary.test.tsx`
- `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.test.tsx`
- `packages/web-ui/src/components/scada/__tests__/ScadaCanvas.test.tsx`
- `packages/web-ui/src/app/scada2/[viewId]/page.tsx`
- `packages/web-ui/src/app/scada2/[viewId]/__tests__/page.test.tsx`

**New (server):**
- `packages/server/migrations/030-scada-view-svg-flag.sql`

**Modified:**
- `packages/web-ui/src/widgets/registry.ts` — add `kind: 'svg' | 'react'` discriminator (legacy entries default `'react'`)

---

## Task 1: Migration 030 — add `is_svg` column to `scada_views`

**Files:**
- Create: `packages/server/migrations/030-scada-view-svg-flag.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 030-scada-view-svg-flag.sql
-- Adds is_svg flag so the sub-project 1/8 SVG runtime can coexist with the
-- legacy React-widget renderer until sub-project 7 deletes the legacy path.

ALTER TABLE scada_views ADD COLUMN is_svg INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Verify migration applies cleanly against the dev DB**

Run:
```bash
cd /Volumes/SSD/BIOCORE
sqlite3 packages/server/data/biocore.db < packages/server/migrations/030-scada-view-svg-flag.sql
sqlite3 packages/server/data/biocore.db "PRAGMA table_info('scada_views');" | grep is_svg
```

Expected: line containing `is_svg|INTEGER|1||0` (notnull=1, default=0).

- [ ] **Step 3: Verify existing rows have is_svg=0**

Run:
```bash
sqlite3 packages/server/data/biocore.db "SELECT count(*) FROM scada_views WHERE is_svg = 0;"
sqlite3 packages/server/data/biocore.db "SELECT count(*) FROM scada_views WHERE is_svg = 1;"
```

Expected: first count = N (all existing views), second = 0.

- [ ] **Step 4: Commit**

```bash
git add packages/server/migrations/030-scada-view-svg-flag.sql
git commit -m "feat(scada): migration 030 — add is_svg flag for SVG runtime coexistence"
```

---

## Task 2: SVG widget types + zod schema

**Files:**
- Create: `packages/web-ui/src/widgets/svg/types.ts`

- [ ] **Step 1: Write the types and zod schema**

```typescript
// packages/web-ui/src/widgets/svg/types.ts
import { z } from 'zod';
import type { FC } from 'react';

export interface SvgViewJson {
  width: number;
  height: number;
  background?: string;
  items: SvgWidgetItem[];
}

export interface SvgWidgetItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  bindings?: { tag?: string };
  props?: Record<string, unknown>;
}

export interface SvgWidgetProps {
  width: number;
  height: number;
  tagValue?: unknown;
  tagStale?: boolean;
  config?: Record<string, unknown>;
}

export type SvgWidgetComponent = FC<SvgWidgetProps>;

export const SvgViewJsonSchema = z.object({
  width: z.number().positive().int(),
  height: z.number().positive().int(),
  background: z.string().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    rotation: z.number().optional(),
    zIndex: z.number().int().optional(),
    visible: z.boolean().optional(),
    bindings: z.object({ tag: z.string().optional() }).optional(),
    props: z.record(z.unknown()).optional(),
  })),
});
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no new errors mentioning `widgets/svg/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/web-ui/src/widgets/svg/types.ts
git commit -m "feat(scada-svg): SvgViewJson + SvgWidgetItem types + zod schema"
```

---

## Task 3: SVG widget registry + 4 tests

**Files:**
- Create: `packages/web-ui/src/widgets/svg/registry.ts`
- Create: `packages/web-ui/src/widgets/svg/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web-ui/src/widgets/svg/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerSvg, getSvgWidget, listSvgWidgets, _resetSvgRegistryForTests } from '../registry';
import type { SvgWidgetComponent } from '../types';

const DummyComp: SvgWidgetComponent = () => null;

describe('SVG widget registry', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
  });

  it('returns the registration after registering', () => {
    registerSvg({ type: 'svg-foo', label: 'Foo', component: DummyComp });
    const reg = getSvgWidget('svg-foo');
    expect(reg?.type).toBe('svg-foo');
    expect(reg?.label).toBe('Foo');
    expect(reg?.component).toBe(DummyComp);
  });

  it('returns undefined for unknown type', () => {
    expect(getSvgWidget('unknown')).toBeUndefined();
  });

  it('listSvgWidgets returns all registered, sorted by type', () => {
    registerSvg({ type: 'svg-zeta', label: 'Z', component: DummyComp });
    registerSvg({ type: 'svg-alpha', label: 'A', component: DummyComp });
    const types = listSvgWidgets().map((r) => r.type);
    expect(types).toEqual(['svg-alpha', 'svg-zeta']);
  });

  it('throws on duplicate type', () => {
    registerSvg({ type: 'svg-dup', label: 'Dup', component: DummyComp });
    expect(() => registerSvg({ type: 'svg-dup', label: 'Dup2', component: DummyComp })).toThrow(
      /duplicate widget type/i,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/widgets/svg/__tests__/registry.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module '../registry'".

- [ ] **Step 3: Implement the registry**

```typescript
// packages/web-ui/src/widgets/svg/registry.ts
import type { SvgWidgetComponent } from './types';

export interface SvgWidgetRegistration {
  type: string;
  label: string;
  component: SvgWidgetComponent;
  defaults?: { w: number; h: number };
}

const registry = new Map<string, SvgWidgetRegistration>();

export function registerSvg(reg: SvgWidgetRegistration): void {
  if (registry.has(reg.type)) {
    throw new Error(`duplicate widget type: ${reg.type}`);
  }
  registry.set(reg.type, reg);
}

export function getSvgWidget(type: string): SvgWidgetRegistration | undefined {
  return registry.get(type);
}

export function listSvgWidgets(): SvgWidgetRegistration[] {
  return Array.from(registry.values()).sort((a, b) => a.type.localeCompare(b.type));
}

// Test-only helper. Not exported from index barrel.
export function _resetSvgRegistryForTests(): void {
  registry.clear();
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/widgets/svg/__tests__/registry.test.ts 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/registry.ts packages/web-ui/src/widgets/svg/__tests__/registry.test.ts
git commit -m "feat(scada-svg): widget registry + 4 tests (register/get/list/duplicate)"
```

---

## Task 4: SvgRect plumbing widget + 2 tests

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgRect.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgRect.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgRect.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgRect } from '../SvgRect';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgRect', () => {
  it('renders <rect> with width/height and default fill #999', () => {
    const { container } = renderInSvg(<SvgRect width={120} height={60} />);
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('width')).toBe('120');
    expect(rect?.getAttribute('height')).toBe('60');
    expect(rect?.getAttribute('fill')).toBe('#999');
  });

  it('uses config.fill when provided', () => {
    const { container } = renderInSvg(<SvgRect width={10} height={10} config={{ fill: '#0f0' }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#0f0');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/widgets/svg/__tests__/SvgRect.test.tsx 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module '../SvgRect'".

- [ ] **Step 3: Implement SvgRect**

```tsx
// packages/web-ui/src/widgets/svg/SvgRect.tsx
import type { SvgWidgetComponent } from './types';

export const SvgRect: SvgWidgetComponent = ({ width, height, config }) => {
  const fill = typeof config?.fill === 'string' ? (config.fill as string) : '#999';
  return <rect width={width} height={height} fill={fill} />;
};
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgRect.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgRect.tsx packages/web-ui/src/widgets/svg/__tests__/SvgRect.test.tsx
git commit -m "feat(scada-svg): SvgRect plumbing widget + 2 tests (default fill + config.fill)"
```

---

## Task 5: SvgLabel plumbing widget + 4 tests

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgLabel.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgLabel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgLabel.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgLabel } from '../SvgLabel';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgLabel', () => {
  it('renders <text> with the string tagValue', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue="hello" />);
    expect(container.querySelector('text')?.textContent).toBe('hello');
  });

  it('renders the stringified number when tagValue is a number', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });

  it('renders the em-dash placeholder when tagValue is undefined', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });

  it('adds opacity-50 class on the <text> when tagStale is true', () => {
    const { container } = renderInSvg(
      <SvgLabel width={100} height={20} tagValue="x" tagStale={true} />,
    );
    expect(container.querySelector('text')?.getAttribute('class')).toContain('opacity-50');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgLabel.test.tsx 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module '../SvgLabel'".

- [ ] **Step 3: Implement SvgLabel**

```tsx
// packages/web-ui/src/widgets/svg/SvgLabel.tsx
import type { SvgWidgetComponent } from './types';

export const SvgLabel: SvgWidgetComponent = ({ width, height, tagValue, tagStale }) => {
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  const className = tagStale ? 'opacity-50' : undefined;
  return (
    <text
      x={width / 2}
      y={height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fill="currentColor"
      className={className}
    >
      {text}
    </text>
  );
};
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgLabel.test.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgLabel.tsx packages/web-ui/src/widgets/svg/__tests__/SvgLabel.test.tsx
git commit -m "feat(scada-svg): SvgLabel plumbing widget + 4 tests (string/number/undefined/stale)"
```

---

## Task 6: SVG barrel + self-registration + fixtures

**Files:**
- Create: `packages/web-ui/src/widgets/svg/index.ts`
- Create: `packages/web-ui/src/widgets/svg/__tests__/fixtures.ts`

- [ ] **Step 1: Write the barrel with self-registration**

```typescript
// packages/web-ui/src/widgets/svg/index.ts
import { registerSvg } from './registry';
import { SvgLabel } from './SvgLabel';
import { SvgRect } from './SvgRect';

let registered = false;
export function ensureBuiltinSvgWidgetsRegistered(): void {
  if (registered) return;
  registerSvg({ type: 'svg-label', label: 'Label', component: SvgLabel, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-rect', label: 'Rect', component: SvgRect, defaults: { w: 100, h: 60 } });
  registered = true;
}

export * from './types';
export { registerSvg, getSvgWidget, listSvgWidgets } from './registry';
export { SvgLabel } from './SvgLabel';
export { SvgRect } from './SvgRect';
```

- [ ] **Step 2: Write the fixtures file (used by later tasks)**

```typescript
// packages/web-ui/src/widgets/svg/__tests__/fixtures.ts
import type { SvgViewJson } from '../types';

export const EMPTY_VIEW: SvgViewJson = { width: 800, height: 600, items: [] };

export const SINGLE_RECT_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'r1', type: 'svg-rect', x: 10, y: 10, w: 100, h: 60, props: { fill: '#0a0' } },
  ],
};

export const SINGLE_LABEL_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'l1', type: 'svg-label', x: 50, y: 100, w: 100, h: 20, bindings: { tag: 'F01.TEMP' } },
  ],
};

export const MULTI_ZINDEX_VIEW: SvgViewJson = {
  width: 800,
  height: 600,
  items: [
    { id: 'mid', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 2 },
    { id: 'low', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 1 },
    { id: 'top', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10, zIndex: 3 },
  ],
};
```

- [ ] **Step 3: Type-check passes**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no errors mentioning `widgets/svg/`.

- [ ] **Step 4: Commit**

```bash
git add packages/web-ui/src/widgets/svg/index.ts packages/web-ui/src/widgets/svg/__tests__/fixtures.ts
git commit -m "feat(scada-svg): index barrel + ensureBuiltinSvgWidgetsRegistered + test fixtures"
```

---

## Task 7: SvgErrorBoundary + 3 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/SvgErrorBoundary.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/SvgErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/components/scada/__tests__/SvgErrorBoundary.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgErrorBoundary } from '../SvgErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('kaboom');
  return <circle r={5} />;
}

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the fallback red rect when child throws and logs the widget id', () => {
    const { container } = renderInSvg(
      <SvgErrorBoundary widgetId="w-throws" w={50} h={30}>
        <Boom shouldThrow={true} />
      </SvgErrorBoundary>,
    );
    const rect = container.querySelector('rect[fill="#fee"]');
    expect(rect).not.toBeNull();
    const text = container.querySelector('text');
    expect(text?.textContent).toBe('error');
    expect(errorSpy).toHaveBeenCalled();
    const loggedMsg = String(errorSpy.mock.calls.flat().join(' '));
    expect(loggedMsg).toContain('w-throws');
  });

  it('passes children through when no error', () => {
    const { container } = renderInSvg(
      <SvgErrorBoundary widgetId="w-ok" w={50} h={30}>
        <Boom shouldThrow={false} />
      </SvgErrorBoundary>,
    );
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('rect[fill="#fee"]')).toBeNull();
  });

  it('resets error state when remounted with a new key', () => {
    const { container, rerender } = renderInSvg(
      <SvgErrorBoundary key="a" widgetId="w" w={50} h={30}>
        <Boom shouldThrow={true} />
      </SvgErrorBoundary>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();

    rerender(
      <svg>
        <SvgErrorBoundary key="b" widgetId="w" w={50} h={30}>
          <Boom shouldThrow={false} />
        </SvgErrorBoundary>
      </svg>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/components/scada/__tests__/SvgErrorBoundary.test.tsx 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module '../SvgErrorBoundary'".

- [ ] **Step 3: Implement SvgErrorBoundary**

```tsx
// packages/web-ui/src/components/scada/SvgErrorBoundary.tsx
'use client';
import React from 'react';

interface Props {
  widgetId: string;
  w: number;
  h: number;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class SvgErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`SvgErrorBoundary widgetId=${this.props.widgetId}`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <g>
          <rect width={this.props.w} height={this.props.h} fill="#fee" stroke="#c33" />
          <text x={4} y={14} fontSize={10} fill="#c33">error</text>
        </g>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/components/scada/__tests__/SvgErrorBoundary.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/components/scada/SvgErrorBoundary.tsx packages/web-ui/src/components/scada/__tests__/SvgErrorBoundary.test.tsx
git commit -m "feat(scada-svg): SvgErrorBoundary + 3 tests (throw/ok/remount-reset)"
```

---

## Task 8: ViewErrorDisplay helper (used by ScadaCanvas in Task 10)

**Files:**
- Create: `packages/web-ui/src/components/scada/ViewErrorDisplay.tsx`

> No standalone tests; coverage comes through ScadaCanvas tests in Task 10.

- [ ] **Step 1: Implement ViewErrorDisplay**

```tsx
// packages/web-ui/src/components/scada/ViewErrorDisplay.tsx
'use client';
import type { ZodIssue } from 'zod';

interface Props {
  issues: ZodIssue[];
}

export function ViewErrorDisplay({ issues }: Props) {
  return (
    <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm">
      <p className="font-medium mb-2">画面数据损坏</p>
      <ul className="list-disc pl-5 space-y-1">
        {issues.map((iss, i) => (
          <li key={i}>
            <code className="font-mono">{iss.path.join('.') || '(root)'}</code>: {iss.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Type-check passes**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no errors mentioning `ViewErrorDisplay`.

- [ ] **Step 3: Commit**

```bash
git add packages/web-ui/src/components/scada/ViewErrorDisplay.tsx
git commit -m "feat(scada-svg): ViewErrorDisplay helper for zod issues"
```

---

## Task 9: SvgWidgetInstance + 8 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.test.tsx`

> **Hook rules note:** `useTag` MUST be called unconditionally per React Rules of Hooks. The implementation below always calls `useTag` (with empty tag string when binding is absent) and only forwards the value to the widget when a binding exists.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import { registerSvg, _resetSvgRegistryForTests } from '../../../widgets/svg/registry';
import type { SvgWidgetComponent } from '../../../widgets/svg/types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, stale: false })),
}));

import { useTag } from '@/hooks/useTag';
const useTagMock = useTag as unknown as ReturnType<typeof vi.fn>;

const Label: SvgWidgetComponent = ({ tagValue }) => (
  <text data-testid="lbl">{String(tagValue ?? '—')}</text>
);
const Boom: SvgWidgetComponent = () => {
  throw new Error('boom');
};
const Sibling: SvgWidgetComponent = () => <circle data-testid="sib" r={1} />;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
    registerSvg({ type: 'svg-label', label: 'Label', component: Label });
    registerSvg({ type: 'svg-boom', label: 'Boom', component: Boom });
    registerSvg({ type: 'svg-sib', label: 'Sib', component: Sibling });
    useTagMock.mockReset();
    useTagMock.mockReturnValue({ value: undefined, stale: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when instance.visible is false', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 10, y: 20, w: 30, h: 40, visible: false }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('g')).toBeNull();
  });

  it('wraps in <g> with translate(x,y)', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 10, y: 20, w: 30, h: 40 }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('g')?.getAttribute('transform')).toContain('translate(10,20)');
  });

  it('includes rotate(deg, w/2, h/2) when rotation present', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 0, y: 0, w: 60, h: 40, rotation: 90 }}
        reactorId="F01"
      />,
    );
    const t = container.querySelector('g')?.getAttribute('transform') ?? '';
    expect(t).toContain('rotate(90,30,20)');
  });

  it('dispatches via registry to the matching component and forwards bound tag value', () => {
    useTagMock.mockReturnValue({ value: 'hello', stale: false });
    const { getByTestId } = renderInSvg(
      <SvgWidgetInstance
        instance={{
          id: 'a',
          type: 'svg-label',
          x: 0,
          y: 0,
          w: 30,
          h: 20,
          bindings: { tag: 'F01.TEMP' },
        }}
        reactorId="F01"
      />,
    );
    expect(getByTestId('lbl').textContent).toBe('hello');
  });

  it('renders red placeholder + console.warn when type is unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-nope', x: 0, y: 0, w: 30, h: 20 }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('?svg-nope');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('svg-nope'));
  });

  it('calls useTag with reactorId and bindings.tag when binding present', () => {
    useTagMock.mockReturnValue({ value: 42, stale: false });
    renderInSvg(
      <SvgWidgetInstance
        instance={{
          id: 'a',
          type: 'svg-label',
          x: 0, y: 0, w: 30, h: 20,
          bindings: { tag: 'F01.TEMP' },
        }}
        reactorId="F01"
      />,
    );
    expect(useTagMock).toHaveBeenCalledWith('F01', 'F01.TEMP');
  });

  it('calls useTag with empty tag and forwards tagValue=undefined when bindings missing', () => {
    const { getByTestId } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 0, y: 0, w: 30, h: 20 }}
        reactorId="F01"
      />,
    );
    expect(getByTestId('lbl').textContent).toBe('—');
    expect(useTagMock).toHaveBeenCalledWith('F01', '');
  });

  it('ErrorBoundary catches widget throw and does not crash siblings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, getByTestId } = render(
      <svg>
        <SvgWidgetInstance
          instance={{ id: 'bad', type: 'svg-boom', x: 0, y: 0, w: 30, h: 20 }}
          reactorId="F01"
        />
        <SvgWidgetInstance
          instance={{ id: 'good', type: 'svg-sib', x: 0, y: 0, w: 30, h: 20 }}
          reactorId="F01"
        />
      </svg>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();
    expect(getByTestId('sib')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.test.tsx 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module '../SvgWidgetInstance'".

- [ ] **Step 3: Implement SvgWidgetInstance**

```tsx
// packages/web-ui/src/components/scada/SvgWidgetInstance.tsx
'use client';
import { useTag } from '@/hooks/useTag';
import { getSvgWidget } from '@/widgets/svg/registry';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { SvgErrorBoundary } from './SvgErrorBoundary';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

export function SvgWidgetInstance({ instance, reactorId }: Props) {
  if (instance.visible === false) return null;

  const transform = buildTransform(instance);
  const tagName = instance.bindings?.tag ?? '';

  // Hook called unconditionally (Rules of Hooks); empty tag = no binding.
  const tagState = useTag(reactorId, tagName);
  const hasBinding = !!instance.bindings?.tag;

  const reg = getSvgWidget(instance.type);
  if (!reg) {
    console.warn(`Unknown SVG widget type: ${instance.type}`);
    return (
      <g transform={transform}>
        <rect width={instance.w} height={instance.h} fill="#fee" stroke="#c33" />
        <text x={4} y={14} fontSize={10} fill="#c33">?{instance.type}</text>
      </g>
    );
  }

  const Component = reg.component;

  return (
    <g transform={transform}>
      <SvgErrorBoundary widgetId={instance.id} w={instance.w} h={instance.h}>
        <Component
          width={instance.w}
          height={instance.h}
          tagValue={hasBinding ? tagState.value : undefined}
          tagStale={hasBinding ? tagState.stale : undefined}
          config={instance.props}
        />
      </SvgErrorBoundary>
    </g>
  );
}

function buildTransform(instance: SvgWidgetItem): string {
  const parts: string[] = [`translate(${instance.x},${instance.y})`];
  if (instance.rotation) {
    parts.push(`rotate(${instance.rotation},${instance.w / 2},${instance.h / 2})`);
  }
  return parts.join(' ');
}
```

> **Pre-check before running tests:** confirm `useTag` accepts an empty tag string and returns `{value: undefined, stale: false}` without throwing. Inspect `packages/web-ui/src/hooks/useTag.ts`. If it throws or subscribes incorrectly with empty tag, add an internal guard at the top of `useTag`:
>
> ```ts
> if (!tag) return { value: undefined, stale: false, lastUpdate: 0 };
> ```
>
> This guard must be added IN `useTag` itself, not in the caller — moving the conditional out preserves Rules of Hooks.

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.test.tsx 2>&1 | tail -10
```

Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/components/scada/SvgWidgetInstance.tsx packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.test.tsx
# Also stage useTag.ts if a guard was added in step 3 pre-check.
git status -s
git commit -m "feat(scada-svg): SvgWidgetInstance + 8 tests (visible/transform/rotate/dispatch/unknown/binding/no-binding/errorboundary)"
```

---

## Task 10: ScadaCanvas + 6 tests

**Files:**
- Create: `packages/web-ui/src/components/scada/ScadaCanvas.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/ScadaCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/components/scada/__tests__/ScadaCanvas.test.tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ScadaCanvas } from '../ScadaCanvas';
import { ensureBuiltinSvgWidgetsRegistered } from '../../../widgets/svg';
import { _resetSvgRegistryForTests } from '../../../widgets/svg/registry';
import {
  EMPTY_VIEW,
  SINGLE_RECT_VIEW,
  MULTI_ZINDEX_VIEW,
} from '../../../widgets/svg/__tests__/fixtures';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, stale: false })),
}));

describe('ScadaCanvas', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
    ensureBuiltinSvgWidgetsRegistered();
  });

  it('renders an <svg> with viewBox "0 0 W H"', () => {
    const { container } = render(<ScadaCanvas view={EMPTY_VIEW} reactorId="F01" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 600');
  });

  it('renders backing rect with view.background', () => {
    const view = { ...EMPTY_VIEW, background: '#eef' };
    const { container } = render(<ScadaCanvas view={view} reactorId="F01" />);
    const bg = container.querySelector('svg > rect');
    expect(bg?.getAttribute('fill')).toBe('#eef');
  });

  it('renders 3 groups (one per item) for MULTI_ZINDEX_VIEW', () => {
    const { container } = render(<ScadaCanvas view={MULTI_ZINDEX_VIEW} reactorId="F01" />);
    const groups = Array.from(container.querySelectorAll('svg > g'));
    expect(groups.length).toBe(3);
  });

  it('renders one widget per item (smoke for SINGLE_RECT_VIEW)', () => {
    const { container } = render(<ScadaCanvas view={SINGLE_RECT_VIEW} reactorId="F01" />);
    expect(container.querySelectorAll('svg > g').length).toBe(1);
    expect(container.querySelector('svg > g > rect')).not.toBeNull();
  });

  it('renders empty <svg> for empty items', () => {
    const { container } = render(<ScadaCanvas view={EMPTY_VIEW} reactorId="F01" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('svg > g').length).toBe(0);
  });

  it('renders ViewErrorDisplay when view.width is invalid', () => {
    const bad = { ...EMPTY_VIEW, width: 0 };
    const { container, getByRole } = render(
      <ScadaCanvas view={bad as unknown as typeof EMPTY_VIEW} reactorId="F01" />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(getByRole('alert')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
pnpm exec vitest run src/components/scada/__tests__/ScadaCanvas.test.tsx 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module '../ScadaCanvas'".

- [ ] **Step 3: Implement ScadaCanvas**

```tsx
// packages/web-ui/src/components/scada/ScadaCanvas.tsx
'use client';
import { SvgViewJsonSchema, type SvgViewJson, type SvgWidgetItem } from '@/widgets/svg/types';
import { SvgWidgetInstance } from './SvgWidgetInstance';
import { ViewErrorDisplay } from './ViewErrorDisplay';

interface Props {
  view: SvgViewJson;
  reactorId: string;
}

export function ScadaCanvas({ view, reactorId }: Props) {
  const parsed = SvgViewJsonSchema.safeParse(view);
  if (!parsed.success) {
    return <ViewErrorDisplay issues={parsed.error.issues} />;
  }
  const v = parsed.data as SvgViewJson;

  const sorted = [...v.items].sort(byZIndex);

  return (
    <svg
      viewBox={`0 0 ${v.width} ${v.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
    >
      {v.background ? <rect width={v.width} height={v.height} fill={v.background} /> : null}
      {sorted.map((item) => (
        <SvgWidgetInstance key={item.id} instance={item as SvgWidgetItem} reactorId={reactorId} />
      ))}
    </svg>
  );
}

function byZIndex(a: SvgWidgetItem, b: SvgWidgetItem): number {
  return (a.zIndex ?? 0) - (b.zIndex ?? 0);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run src/components/scada/__tests__/ScadaCanvas.test.tsx 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/components/scada/ScadaCanvas.tsx packages/web-ui/src/components/scada/__tests__/ScadaCanvas.test.tsx
git commit -m "feat(scada-svg): ScadaCanvas + 6 tests (viewBox/bg/zIndex-count/single/empty/invalid)"
```

---

## Task 11: `/scada2/[viewId]` page + 6 integration tests

**Files:**
- Create: `packages/web-ui/src/app/scada2/[viewId]/page.tsx`
- Create: `packages/web-ui/src/app/scada2/[viewId]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web-ui/src/app/scada2/[viewId]/__tests__/page.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Page from '../page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ viewId: 'v1' }),
  useSearchParams: () => ({ get: (k: string) => (k === 'reactor' ? 'F01' : null) }),
}));

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, stale: false })),
}));

const SVG_VIEW = {
  id: 'v1',
  name: 'Test',
  is_svg: 1,
  widgets: { width: 800, height: 600, items: [] },
};

const LEGACY_VIEW = { id: 'v1', name: 'Legacy', is_svg: 0, widgets: {} };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('/scada2/[viewId] page', () => {
  const originalAssign = window.location.assign;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window.location, 'assign', { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window.location, 'assign', { value: originalAssign, configurable: true });
  });

  it('renders ScadaCanvas when is_svg=1', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, SVG_VIEW));
    const { container } = render(<Page />);
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
  });

  it('renders legacy notice when is_svg=0', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, LEGACY_VIEW));
    const { findByText } = render(<Page />);
    expect(await findByText(/Legacy view/i)).not.toBeNull();
  });

  it('renders 画面不存在 + back link on 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(404, { error: 'not found' }));
    const { findByText, findByRole } = render(<Page />);
    expect(await findByText('画面不存在')).not.toBeNull();
    expect((await findByRole('link', { name: /返回/ })).getAttribute('href')).toBe('/scada');
  });

  it('renders retry button on 500 and refetches on click', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, { error: 'oops' }))
      .mockResolvedValueOnce(jsonResponse(200, SVG_VIEW));
    const { findByRole, container } = render(<Page />);
    const btn = await findByRole('button', { name: /重试|retry/i });
    btn.click();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('redirects to /login on 401', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    render(<Page />);
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/login'));
  });

  it('shows loading spinner before fetch resolves', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    const { getByRole } = render(<Page />);
    expect(getByRole('status').textContent).toMatch(/加载|loading/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run:
```bash
pnpm exec vitest run 'src/app/scada2/[viewId]/__tests__/page.test.tsx' 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module '../page'".

- [ ] **Step 3: Implement the page**

```tsx
// packages/web-ui/src/app/scada2/[viewId]/page.tsx
'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ScadaCanvas } from '@/components/scada/ScadaCanvas';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgViewJson } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'svg'; view: SvgViewJson }
  | { kind: 'legacy' };

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const reactorId = search?.get('reactor') ?? 'F01';
  const viewId = params?.viewId ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/scada/views/${encodeURIComponent(viewId)}`, {
        credentials: 'include',
      });
      if (r.status === 401 || r.status === 403) {
        window.location.assign('/login');
        return;
      }
      if (r.status === 404) {
        setState({ kind: 'error', status: 404, message: '画面不存在' });
        return;
      }
      if (!r.ok) {
        setState({ kind: 'error', status: r.status, message: '服务器错误' });
        return;
      }
      const body = (await r.json()) as { is_svg?: number; widgets?: unknown };
      if (body.is_svg === 1) {
        setState({ kind: 'svg', view: body.widgets as SvgViewJson });
      } else {
        setState({ kind: 'legacy' });
      }
    } catch {
      setState({ kind: 'error', status: 0, message: '无法加载画面' });
    }
  }, [viewId]);

  useEffect(() => {
    if (viewId) load();
  }, [viewId, load]);

  if (state.kind === 'loading') {
    return (
      <div role="status" className="p-6 text-slate-500">
        加载中…
      </div>
    );
  }
  if (state.kind === 'error') {
    if (state.status === 404) {
      return (
        <div className="p-6">
          <p>画面不存在</p>
          <a href="/scada" role="link" aria-label="返回 SCADA 列表">
            返回 /scada
          </a>
        </div>
      );
    }
    return (
      <div className="p-6">
        <p>{state.message}</p>
        <button onClick={load} className="mt-2 px-3 py-1 border rounded">重试</button>
      </div>
    );
  }
  if (state.kind === 'legacy') {
    return (
      <div className="p-6">
        <p>Legacy view — open via /scada/{viewId}</p>
      </div>
    );
  }
  return <ScadaCanvas view={state.view} reactorId={reactorId} />;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run:
```bash
pnpm exec vitest run 'src/app/scada2/[viewId]/__tests__/page.test.tsx' 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/app/scada2/
git commit -m "feat(scada-svg): /scada2/[viewId] page + 6 integration tests (svg/legacy/404/500-retry/401/loading)"
```

---

## Task 12: `kind` discriminator on legacy registry + full smoke + done criteria

**Files:**
- Modify: `packages/web-ui/src/widgets/registry.ts`

- [ ] **Step 1: Inspect the existing legacy registry shape**

Run:
```bash
cd /Volumes/SSD/BIOCORE
grep -nE 'export (function|interface|type|const)' packages/web-ui/src/widgets/registry.ts | head -20
```

Expected: registration interface (commonly `WidgetRegistration`) with no `kind` field.

- [ ] **Step 2: Add `kind` discriminator to the registration interface**

Open `packages/web-ui/src/widgets/registry.ts`. Locate the registration interface and add the `kind?` field with a doc comment:

```typescript
export interface WidgetRegistration {
  // ... existing fields ...
  /** Discriminator: 'react' = legacy DOM widget renderer (default); 'svg' = SVG runtime (sub-project 1/8 onward). */
  kind?: 'svg' | 'react';
}
```

Do NOT add a runtime default — consumers reading `reg.kind` should treat `undefined` as `'react'`.

If the registration interface has a different name in the actual file, adapt to match (do not rename).

- [ ] **Step 3: Run full web-ui test suite**

Run:
```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm test 2>&1 | tail -20
```

Expected: all green. Added test count = 33 (4+2+4+3+8+6+6); total = previous baseline + 33.

- [ ] **Step 4: Type-check passes**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no new errors.

- [ ] **Step 5: Manual smoke — insert SVG view, navigate, verify live tag**

Insert a smoke-test view:

```bash
cd /Volumes/SSD/BIOCORE
sqlite3 packages/server/data/biocore.db <<'SQL'
INSERT INTO scada_views (id, name, is_svg, widgets, bindings, created_by, updated_by)
VALUES (
  'smoke-svg-1',
  'SVG Smoke',
  1,
  json('{"width":800,"height":600,"background":"#f0f4f8","items":[
    {"id":"label1","type":"svg-label","x":100,"y":100,"w":120,"h":24,"bindings":{"tag":"F01.TEMP"}},
    {"id":"rect1","type":"svg-rect","x":300,"y":100,"w":100,"h":60,"props":{"fill":"#0a0"}}
  ]}'),
  json('{}'),
  'admin-001',
  'admin-001'
);
SQL
```

If existing `scada_views` schema columns differ from `created_by`/`updated_by`/`bindings`, adapt the INSERT (run `sqlite3 packages/server/data/biocore.db "PRAGMA table_info('scada_views');"` to confirm column list).

Start dev servers if not already running:

```bash
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm dev:server > /tmp/biocore-server.log 2>&1 &
pnpm dev:ui > /tmp/biocore-ui.log 2>&1 &
```

Wait for `:3000` and `:3001` LISTEN, then open browser to:

`http://localhost:3000/scada2/smoke-svg-1?reactor=F01`

Expected (visual):
- Background `#f0f4f8` rect spans the canvas
- Live F01.TEMP value rendered as text near top-left
- Green `#0a0` rect at (300,100)
- Tag value updates ~1Hz (WS-driven; verify via DevTools Elements panel that the `<text>` content changes)

- [ ] **Step 6: Verify legacy `/scada/[viewId]` still renders**

Open browser to an existing `/scada/<existing-view-id>` URL (from `sqlite3 packages/server/data/biocore.db "SELECT id FROM scada_views WHERE is_svg = 0 LIMIT 1;"`). Expected: legacy widget view renders unchanged.

- [ ] **Step 7: Clean up smoke-test view**

```bash
sqlite3 packages/server/data/biocore.db "DELETE FROM scada_views WHERE id='smoke-svg-1';"
```

- [ ] **Step 8: Commit + push**

```bash
git add packages/web-ui/src/widgets/registry.ts
git commit -m "feat(scada-svg): add kind discriminator to legacy widget registry (default 'react')"
git push origin feat/scada-data-model
```

---

## Done criteria

- 33 new tests green (registry 4 + SvgRect 2 + SvgLabel 4 + SvgErrorBoundary 3 + SvgWidgetInstance 8 + ScadaCanvas 6 + page 6).
- `pnpm --filter @biocore/web-ui test` green.
- `pnpm --filter @biocore/server test` green (no server-side test changes; smoke only).
- Migration 030 applied; `is_svg` column exists with default 0.
- Manual smoke at `/scada2/smoke-svg-1?reactor=F01` shows live tag value + colored rect.
- Legacy `/scada/[viewId]` renders unchanged.
- 12 commits pushed to `feat/scada-data-model` (and merged to `main` by the maintainer).
- Branch ready for sub-project 2 (widget library v2 — port 9 legacy widgets + add 16 new in `widgets/svg/`).
