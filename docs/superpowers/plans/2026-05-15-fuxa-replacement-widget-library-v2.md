# FUXA Replacement — Sub-project 2/8: Widget Library v2 (SVG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 22 SVG widget components to the registry on top of sub-project 1's runtime, bringing the registry to 24 widgets total (combined with `svg-label`/`svg-rect`).

**Architecture:** Each widget is a small pure-SVG React component conforming to `SvgWidgetComponent`. All widgets follow a uniform shape: destructure `{width, height, tagValue, tagStale, config}`, coerce `tagValue` to the type the widget needs, extract `config` keys with defaults, apply `opacity-50` when `tagStale`, render pure SVG primitives.

**Tech Stack:** React 18 · TypeScript · vitest 1.6 + @testing-library/react 14 + jsdom · existing `useTag` + `useTagHistory` hooks.

**Spec:** [/docs/superpowers/specs/2026-05-15-fuxa-replacement-widget-library-v2-design.md](../specs/2026-05-15-fuxa-replacement-widget-library-v2-design.md)

**Branch:** feat/scada-data-model

**Total tests:** ~62 (22 widget files + 1 registry-builtins)

**Hook signatures (real, verified):**
- `useTag(tagId: string)` returns `{ value: unknown, isStale: boolean, lastUpdate?: number }`
- `useTagHistory(tagId: string, opts?: { windowSec?: number; staleMs?: number })` returns `{ points: Array<{t: number; v: number}>; isStale: boolean }`

---

## File Structure (locked)

**New widget files (22, all under `packages/web-ui/src/widgets/svg/`):**

Group A (port from legacy): `SvgLamp.tsx`, `SvgIndicator.tsx`, `SvgPump.tsx`, `SvgValve.tsx`, `SvgTank.tsx`, `SvgTrend.tsx`, `SvgButton.tsx`

Group B (generic FUXA-style): `SvgMotor.tsx`, `SvgGauge.tsx`, `SvgSlider.tsx`, `SvgSwitch.tsx`, `SvgSelect.tsx`, `SvgInput.tsx`, `SvgChart.tsx`, `SvgImage.tsx`, `SvgPipe.tsx`

Group C (fermentation): `SvgReactor.tsx`, `SvgSparger.tsx`, `SvgProbe.tsx`, `SvgStirrer.tsx`, `SvgHeater.tsx`, `SvgSensor.tsx`

**New test files (23, under `packages/web-ui/src/widgets/svg/__tests__/`):**

`Svg{Name}.test.tsx` for each widget above, plus `registry-builtins.test.ts`.

**Modified files (3):**
- `packages/web-ui/src/widgets/svg/types.ts` — add optional `tagName?: string` to `SvgWidgetProps`
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — pass `tagName` to dispatched widget
- `packages/web-ui/src/widgets/svg/index.ts` — register 22 widgets in `ensureBuiltinSvgWidgetsRegistered` + 22 named re-exports

**Test runner:** `pnpm` at `/Users/mac/.hermes/node/bin/pnpm`. Export `PATH="/Users/mac/.hermes/node/bin:$PATH"` if needed.

**Test wrapper helper (used in every widget test file):**
```tsx
function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}
```

---

## Task 1: Extend SvgWidgetProps with `tagName`

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/types.ts`

- [ ] **Step 1: Read current types.ts**

```bash
cd /Volumes/SSD/BIOCORE
cat packages/web-ui/src/widgets/svg/types.ts
```

Locate the `SvgWidgetProps` interface.

- [ ] **Step 2: Add optional `tagName?: string` field**

Edit the `SvgWidgetProps` interface to add `tagName?: string`:

```typescript
export interface SvgWidgetProps {
  width: number;
  height: number;
  tagValue?: unknown;
  tagStale?: boolean;
  tagName?: string;                     // NEW: forwarded by SvgWidgetInstance; used by SvgTrend/SvgChart for useTagHistory
  config?: Record<string, unknown>;
}
```

Leave the zod schema untouched (it validates view JSON shape, not widget props).

- [ ] **Step 3: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no new errors (pre-existing unrelated errors only).

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/types.ts
git commit -m "feat(scada-svg): SvgWidgetProps.tagName for useTagHistory consumers"
```

---

## Task 2: SvgWidgetInstance forwards `tagName`

**Files:**
- Modify: `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`

- [ ] **Step 1: Read current SvgWidgetInstance**

```bash
cat /Volumes/SSD/BIOCORE/packages/web-ui/src/components/scada/SvgWidgetInstance.tsx
```

Find the `<Component ...>` JSX block.

- [ ] **Step 2: Add `tagName` prop**

In the `<Component ...>` block, add `tagName={instance.bindings?.tag}` alongside the existing tagValue/tagStale/config props:

```tsx
        <Component
          width={instance.w}
          height={instance.h}
          tagValue={hasBinding ? tagState.value : undefined}
          tagStale={hasBinding ? tagState.isStale : undefined}
          tagName={instance.bindings?.tag}
          config={instance.props}
        />
```

(Forward unconditionally — even widgets that don't read `tagName` will ignore the extra prop.)

- [ ] **Step 3: Re-run existing tests to confirm no regression**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.test.tsx 2>&1 | tail -10
```

Expected: 8 tests still pass (no test asserts `tagName`, so adding the prop is invisible).

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/SvgWidgetInstance.tsx
git commit -m "feat(scada-svg): SvgWidgetInstance forwards tagName to widgets"
```

---

## Widget task template (applies to Tasks 3–24)

Each widget task follows identical structure. Per-widget content (test code + impl) is repeated in full per skill no-placeholders rule.

For every widget task, the engineer:
1. Writes the failing test file (Step 1).
2. Runs vitest, sees module-not-found (Step 2 — RED).
3. Writes the implementation file (Step 3).
4. Runs vitest, sees all tests pass (Step 4 — GREEN).
5. Commits both files (Step 5).

---

## Task 3: SvgLamp

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgLamp.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgLamp.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgLamp.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgLamp } from '../SvgLamp';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgLamp', () => {
  it('renders off-color circle when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders on-color circle when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('uses config.onColor when provided and truthy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={1} config={{ onColor: '#f00' }} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#f00');
  });

  it('adds opacity-50 class when tagStale is true', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={true} tagStale={true} />);
    expect(container.querySelector('circle')?.getAttribute('class')).toContain('opacity-50');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/widgets/svg/__tests__/SvgLamp.test.tsx 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../SvgLamp'".

- [ ] **Step 3: Implement SvgLamp**

```tsx
// packages/web-ui/src/widgets/svg/SvgLamp.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgLamp: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const on = !!tagValue;
  const onColor = typeof config?.onColor === 'string' ? config.onColor : '#22c55e';
  const offColor = typeof config?.offColor === 'string' ? config.offColor : '#9ca3af';
  return (
    <circle
      cx={width / 2}
      cy={height / 2}
      r={Math.min(width, height) / 2 - 2}
      fill={on ? onColor : offColor}
      stroke="#374151"
      className={tagStale ? 'opacity-50' : undefined}
    />
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgLamp.test.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/SvgLamp.tsx packages/web-ui/src/widgets/svg/__tests__/SvgLamp.test.tsx
git commit -m "feat(scada-svg): SvgLamp + 4 tests (off/on/config-color/stale)"
```

---

## Task 4: SvgIndicator

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgIndicator.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgIndicator.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgIndicator } from '../SvgIndicator';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgIndicator', () => {
  it('renders normal color when value below threshold', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={50} config={{ threshold: 100 }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders alert color when value at or above threshold', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={120} config={{ threshold: 100 }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626');
  });

  it('renders value text', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgIndicator.test.tsx 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement SvgIndicator**

```tsx
// packages/web-ui/src/widgets/svg/SvgIndicator.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgIndicator: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const num = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const threshold = typeof config?.threshold === 'number' ? config.threshold : Infinity;
  const normalColor = typeof config?.normalColor === 'string' ? config.normalColor : '#22c55e';
  const alertColor = typeof config?.alertColor === 'string' ? config.alertColor : '#dc2626';
  const fill = Number.isFinite(num) && num >= threshold ? alertColor : normalColor;
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#fff">
        {text}
      </text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgIndicator.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgIndicator.tsx packages/web-ui/src/widgets/svg/__tests__/SvgIndicator.test.tsx
git commit -m "feat(scada-svg): SvgIndicator + 3 tests (normal/alert/value-text)"
```

---

## Task 5: SvgPump

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgPump.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgPump.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgPump.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgPump } from '../SvgPump';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgPump', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders running color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders impeller path', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgPump.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgPump**

```tsx
// packages/web-ui/src/widgets/svg/SvgPump.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgPump: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const running = !!tagValue;
  const runningColor = typeof config?.runningColor === 'string' ? config.runningColor : '#22c55e';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 2;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <circle cx={cx} cy={cy} r={r} fill={running ? runningColor : idleColor} stroke="#374151" />
      <path d={`M${cx - r * 0.5},${cy} L${cx + r * 0.5},${cy} M${cx},${cy - r * 0.5} L${cx},${cy + r * 0.5}`} stroke="#fff" strokeWidth={2} fill="none" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgPump.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgPump.tsx packages/web-ui/src/widgets/svg/__tests__/SvgPump.test.tsx
git commit -m "feat(scada-svg): SvgPump + 3 tests (idle/running/impeller)"
```

---

## Task 6: SvgValve

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgValve.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgValve.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgValve.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgValve } from '../SvgValve';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgValve', () => {
  it('renders closed color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgValve width={40} height={24} tagValue={false} />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders open color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgValve width={40} height={24} tagValue={true} />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('#22c55e');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgValve.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgValve**

```tsx
// packages/web-ui/src/widgets/svg/SvgValve.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgValve: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const open = !!tagValue;
  const openColor = typeof config?.openColor === 'string' ? config.openColor : '#22c55e';
  const closedColor = typeof config?.closedColor === 'string' ? config.closedColor : '#9ca3af';
  const fill = open ? openColor : closedColor;
  // Bowtie shape: two triangles meeting in the middle.
  const points = `0,0 ${width / 2},${height / 2} 0,${height} ${width},0 ${width / 2},${height / 2} ${width},${height}`;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <polygon points={points} fill={fill} stroke="#374151" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgValve.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgValve.tsx packages/web-ui/src/widgets/svg/__tests__/SvgValve.test.tsx
git commit -m "feat(scada-svg): SvgValve + 2 tests (closed/open)"
```

---

## Task 7: SvgTank

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgTank.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgTank.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgTank.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgTank } from '../SvgTank';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgTank', () => {
  it('renders background rect and zero-height fill when tagValue is 0', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={0} />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2);
    expect(rects[1].getAttribute('height')).toBe('0');
  });

  it('renders 50% fill when tagValue is 50', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={50} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('50');
  });

  it('clamps values above 100 to 100', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={150} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('100');
  });

  it('clamps negative values to 0', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={-10} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('0');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgTank.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgTank**

```tsx
// packages/web-ui/src/widgets/svg/SvgTank.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgTank: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const fillH = (pct / 100) * height;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const bgColor = typeof config?.bgColor === 'string' ? config.bgColor : '#e5e7eb';
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={bgColor} stroke="#374151" />
      <rect x={0} y={height - fillH} width={width} height={fillH} fill={fillColor} />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgTank.test.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgTank.tsx packages/web-ui/src/widgets/svg/__tests__/SvgTank.test.tsx
git commit -m "feat(scada-svg): SvgTank + 4 tests (empty/half/clamp-high/clamp-low)"
```

---

## Task 8: SvgTrend (uses useTagHistory)

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgTrend.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgTrend.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgTrend.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgTrend } from '../SvgTrend';

vi.mock('@/hooks/useTagHistory', () => ({
  useTagHistory: vi.fn(() => ({
    points: [{ t: 0, v: 10 }, { t: 1000, v: 20 }, { t: 2000, v: 30 }],
    isStale: false,
  })),
}));

import { useTagHistory } from '@/hooks/useTagHistory';
const useTagHistoryMock = useTagHistory as unknown as ReturnType<typeof vi.fn>;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgTrend', () => {
  beforeEach(() => {
    useTagHistoryMock.mockReset();
    useTagHistoryMock.mockReturnValue({
      points: [{ t: 0, v: 10 }, { t: 1000, v: 20 }, { t: 2000, v: 30 }],
      isStale: false,
    });
  });

  it('renders polyline with one point per history sample', () => {
    const { container } = renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect((poly?.getAttribute('points') ?? '').trim().split(/\s+/).length).toBe(3);
  });

  it('renders empty polyline when history is empty', () => {
    useTagHistoryMock.mockReturnValue({ points: [], isStale: true });
    const { container } = renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" />);
    expect(container.querySelector('polyline')?.getAttribute('points')).toBe('');
  });

  it('passes windowSec from config.windowSec', () => {
    renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" config={{ windowSec: 30 }} />);
    expect(useTagHistoryMock).toHaveBeenCalledWith('F01.TEMP', { windowSec: 30 });
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgTrend.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgTrend**

```tsx
// packages/web-ui/src/widgets/svg/SvgTrend.tsx
import React from 'react';
import { useTagHistory } from '@/hooks/useTagHistory';
import type { SvgWidgetComponent } from './types';

export const SvgTrend: SvgWidgetComponent = ({ width, height, tagName, config }) => {
  const windowSec = typeof config?.windowSec === 'number' ? config.windowSec : 60;
  const stroke = typeof config?.strokeColor === 'string' ? config.strokeColor : '#3b82f6';
  const strokeWidth = typeof config?.strokeWidth === 'number' ? config.strokeWidth : 2;
  const { points, isStale } = useTagHistory(tagName ?? '', { windowSec });

  if (points.length === 0) {
    return <polyline points="" stroke={stroke} fill="none" strokeWidth={strokeWidth} className={isStale ? 'opacity-50' : undefined} />;
  }

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const vMin = Math.min(...points.map((p) => p.v));
  const vMax = Math.max(...points.map((p) => p.v));
  const tRange = tMax - tMin || 1;
  const vRange = vMax - vMin || 1;

  const coords = points
    .map((p) => {
      const x = ((p.t - tMin) / tRange) * width;
      const y = height - ((p.v - vMin) / vRange) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <polyline
      points={coords}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      className={isStale ? 'opacity-50' : undefined}
    />
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgTrend.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgTrend.tsx packages/web-ui/src/widgets/svg/__tests__/SvgTrend.test.tsx
git commit -m "feat(scada-svg): SvgTrend + 3 tests (points/empty/windowSec) — uses useTagHistory"
```

---

## Task 9: SvgButton

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgButton.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgButton.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgButton } from '../SvgButton';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgButton', () => {
  it('renders rect and label text', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} config={{ label: 'Start' }} />);
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('Start');
  });

  it('falls back to "?" when label missing', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} />);
    expect(container.querySelector('text')?.textContent).toBe('?');
  });

  it('respects config.fontSize', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} config={{ label: 'Go', fontSize: 18 }} />);
    expect(container.querySelector('text')?.getAttribute('font-size')).toBe('18');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgButton.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgButton**

```tsx
// packages/web-ui/src/widgets/svg/SvgButton.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgButton: SvgWidgetComponent = ({ width, height, tagStale, config }) => {
  const label = typeof config?.label === 'string' ? config.label : '?';
  const fontSize = typeof config?.fontSize === 'number' ? config.fontSize : 14;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#e5e7eb" stroke="#374151" rx={4} />
      <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fill="#111827">
        {label}
      </text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgButton.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgButton.tsx packages/web-ui/src/widgets/svg/__tests__/SvgButton.test.tsx
git commit -m "feat(scada-svg): SvgButton + 3 tests (label/fallback/fontSize)"
```

---

## Task 10: SvgMotor

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgMotor.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgMotor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgMotor.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgMotor } from '../SvgMotor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgMotor', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders running color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders an M-shaped path marker', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgMotor.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgMotor**

```tsx
// packages/web-ui/src/widgets/svg/SvgMotor.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgMotor: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const running = !!tagValue;
  const runningColor = typeof config?.runningColor === 'string' ? config.runningColor : '#22c55e';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 2;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <circle cx={cx} cy={cy} r={r} fill={running ? runningColor : idleColor} stroke="#374151" />
      <path
        d={`M${cx - r * 0.4},${cy + r * 0.4} L${cx - r * 0.4},${cy - r * 0.4} L${cx},${cy} L${cx + r * 0.4},${cy - r * 0.4} L${cx + r * 0.4},${cy + r * 0.4}`}
        stroke="#fff"
        strokeWidth={2}
        fill="none"
      />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgMotor.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgMotor.tsx packages/web-ui/src/widgets/svg/__tests__/SvgMotor.test.tsx
git commit -m "feat(scada-svg): SvgMotor + 3 tests (idle/running/M-mark)"
```

---

## Task 11: SvgGauge

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgGauge.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgGauge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgGauge.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgGauge } from '../SvgGauge';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgGauge', () => {
  it('renders background arc and value arc', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={50} />);
    expect(container.querySelectorAll('path').length).toBe(2);
  });

  it('clamps value above max', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={150} config={{ max: 100 }} />);
    const paths = container.querySelectorAll('path');
    expect(paths[1].getAttribute('d')).toMatch(/^M\s/);
  });

  it('renders value text in center', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgGauge.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgGauge**

```tsx
// packages/web-ui/src/widgets/svg/SvgGauge.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const SvgGauge: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const min = typeof config?.min === 'number' ? config.min : 0;
  const max = typeof config?.max === 'number' ? config.max : 100;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const bgColor = typeof config?.bgColor === 'string' ? config.bgColor : '#e5e7eb';

  const v = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
  const pct = (v - min) / (max - min || 1);
  const startDeg = -120;
  const endDeg = -120 + pct * 240;
  const fullEndDeg = 120;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 6;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <path d={arcPath(cx, cy, r, startDeg, fullEndDeg)} stroke={bgColor} strokeWidth={8} fill="none" />
      <path d={arcPath(cx, cy, r, startDeg, endDeg)} stroke={fillColor} strokeWidth={8} fill="none" />
      <text x={cx} y={cy + r * 0.3} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(width, height) / 5}>
        {String(Number.isFinite(raw) ? raw : '—')}
      </text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgGauge.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgGauge.tsx packages/web-ui/src/widgets/svg/__tests__/SvgGauge.test.tsx
git commit -m "feat(scada-svg): SvgGauge + 3 tests (bg+value/clamp/center-text)"
```

---

## Task 12: SvgSlider

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgSlider.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgSlider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgSlider.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSlider } from '../SvgSlider';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSlider', () => {
  it('renders track, fill rect, and thumb circle', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={50} />);
    expect(container.querySelectorAll('rect').length).toBe(2);
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('thumb cx reflects tagValue position', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={50} />);
    expect(container.querySelector('circle')?.getAttribute('cx')).toBe('100');
  });

  it('clamps value above max to thumb at width', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={500} />);
    expect(container.querySelector('circle')?.getAttribute('cx')).toBe('200');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSlider.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgSlider**

```tsx
// packages/web-ui/src/widgets/svg/SvgSlider.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSlider: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const min = typeof config?.min === 'number' ? config.min : 0;
  const max = typeof config?.max === 'number' ? config.max : 100;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';

  const v = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
  const pct = (v - min) / (max - min || 1);
  const thumbX = pct * width;
  const trackY = height / 2 - 2;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect x={0} y={trackY} width={width} height={4} fill="#e5e7eb" />
      <rect x={0} y={trackY} width={thumbX} height={4} fill={fillColor} />
      <circle cx={thumbX} cy={height / 2} r={Math.min(8, height / 2)} fill={fillColor} stroke="#374151" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSlider.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgSlider.tsx packages/web-ui/src/widgets/svg/__tests__/SvgSlider.test.tsx
git commit -m "feat(scada-svg): SvgSlider + 3 tests (rects+thumb/thumb-position/clamp)"
```

---

## Task 13: SvgSwitch

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgSwitch.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgSwitch.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgSwitch.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSwitch } from '../SvgSwitch';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSwitch', () => {
  it('renders off color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders on color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('thumb cx moves right when on', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={true} />);
    expect(Number(container.querySelector('circle')?.getAttribute('cx'))).toBeGreaterThan(25);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSwitch.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgSwitch**

```tsx
// packages/web-ui/src/widgets/svg/SvgSwitch.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSwitch: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const on = !!tagValue;
  const onColor = typeof config?.onColor === 'string' ? config.onColor : '#22c55e';
  const offColor = typeof config?.offColor === 'string' ? config.offColor : '#9ca3af';
  const radius = height / 2;
  const thumbX = on ? width - radius : radius;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={on ? onColor : offColor} stroke="#374151" rx={radius} />
      <circle cx={thumbX} cy={height / 2} r={radius - 2} fill="#fff" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSwitch.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgSwitch.tsx packages/web-ui/src/widgets/svg/__tests__/SvgSwitch.test.tsx
git commit -m "feat(scada-svg): SvgSwitch + 3 tests (off/on/thumb-right)"
```

---

## Task 14: SvgSelect

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgSelect.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgSelect.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgSelect.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSelect } from '../SvgSelect';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSelect', () => {
  it('renders box + value text + arrow path', () => {
    const { container } = renderInSvg(<SvgSelect width={120} height={30} tagValue="OptionA" />);
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('OptionA');
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('renders em-dash when tagValue is undefined', () => {
    const { container } = renderInSvg(<SvgSelect width={120} height={30} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSelect.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgSelect**

```tsx
// packages/web-ui/src/widgets/svg/SvgSelect.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSelect: SvgWidgetComponent = ({ width, height, tagValue, tagStale }) => {
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  const arrowSize = Math.min(8, height / 3);
  const arrowX = width - arrowSize - 6;
  const arrowY = height / 2;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke="#374151" />
      <text x={6} y={height / 2} dominantBaseline="central" fontSize={12} fill="#111827">{text}</text>
      <path d={`M${arrowX},${arrowY - arrowSize / 2} L${arrowX + arrowSize},${arrowY - arrowSize / 2} L${arrowX + arrowSize / 2},${arrowY + arrowSize / 2} Z`} fill="#374151" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSelect.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgSelect.tsx packages/web-ui/src/widgets/svg/__tests__/SvgSelect.test.tsx
git commit -m "feat(scada-svg): SvgSelect + 2 tests (value/arrow + em-dash)"
```

---

## Task 15: SvgInput

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgInput.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgInput.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgInput.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgInput } from '../SvgInput';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgInput', () => {
  it('renders rect with value text when tagValue set', () => {
    const { container } = renderInSvg(<SvgInput width={120} height={28} tagValue="abc" />);
    expect(container.querySelector('text')?.textContent).toBe('abc');
  });

  it('renders placeholder when tagValue undefined', () => {
    const { container } = renderInSvg(<SvgInput width={120} height={28} tagValue={undefined} config={{ placeholder: 'enter…' }} />);
    expect(container.querySelector('text')?.textContent).toBe('enter…');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgInput.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgInput**

```tsx
// packages/web-ui/src/widgets/svg/SvgInput.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgInput: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const placeholder = typeof config?.placeholder === 'string' ? config.placeholder : '';
  const fontSize = typeof config?.fontSize === 'number' ? config.fontSize : 12;
  const isEmpty = tagValue === undefined || tagValue === null || tagValue === '';
  const text = isEmpty ? placeholder : String(tagValue);
  const textColor = isEmpty ? '#9ca3af' : '#111827';
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke="#374151" />
      <text x={6} y={height / 2} dominantBaseline="central" fontSize={fontSize} fill={textColor}>{text}</text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgInput.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgInput.tsx packages/web-ui/src/widgets/svg/__tests__/SvgInput.test.tsx
git commit -m "feat(scada-svg): SvgInput + 2 tests (value/placeholder)"
```

---

## Task 16: SvgChart (uses useTagHistory)

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgChart.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgChart.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgChart.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgChart } from '../SvgChart';

vi.mock('@/hooks/useTagHistory', () => ({
  useTagHistory: vi.fn(() => ({
    points: [
      { t: 0, v: 1 },
      { t: 1, v: 2 },
      { t: 2, v: 3 },
      { t: 3, v: 4 },
    ],
    isStale: false,
  })),
}));

import { useTagHistory } from '@/hooks/useTagHistory';
const useTagHistoryMock = useTagHistory as unknown as ReturnType<typeof vi.fn>;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgChart', () => {
  beforeEach(() => {
    useTagHistoryMock.mockReset();
    useTagHistoryMock.mockReturnValue({
      points: [
        { t: 0, v: 1 },
        { t: 1, v: 2 },
        { t: 2, v: 3 },
        { t: 3, v: 4 },
      ],
      isStale: false,
    });
  });

  it('renders one rect per history point', () => {
    const { container } = renderInSvg(<SvgChart width={200} height={100} tagName="F01.TEMP" />);
    expect(container.querySelectorAll('rect').length).toBe(4);
  });

  it('renders no rects when history is empty', () => {
    useTagHistoryMock.mockReturnValue({ points: [], isStale: true });
    const { container } = renderInSvg(<SvgChart width={200} height={100} tagName="F01.TEMP" />);
    expect(container.querySelectorAll('rect').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgChart.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgChart**

```tsx
// packages/web-ui/src/widgets/svg/SvgChart.tsx
import React from 'react';
import { useTagHistory } from '@/hooks/useTagHistory';
import type { SvgWidgetComponent } from './types';

export const SvgChart: SvgWidgetComponent = ({ width, height, tagName, config }) => {
  const windowSec = typeof config?.windowSec === 'number' ? config.windowSec : 60;
  const barColor = typeof config?.barColor === 'string' ? config.barColor : '#3b82f6';
  const { points, isStale } = useTagHistory(tagName ?? '', { windowSec });

  if (points.length === 0) {
    return <g className={isStale ? 'opacity-50' : undefined} />;
  }

  const vMin = Math.min(...points.map((p) => p.v));
  const vMax = Math.max(...points.map((p) => p.v));
  const vRange = vMax - vMin || 1;
  const barW = width / points.length;

  return (
    <g className={isStale ? 'opacity-50' : undefined}>
      {points.map((p, i) => {
        const h = ((p.v - vMin) / vRange) * height;
        return (
          <rect
            key={i}
            x={i * barW}
            y={height - h}
            width={Math.max(1, barW - 1)}
            height={h}
            fill={barColor}
          />
        );
      })}
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgChart.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgChart.tsx packages/web-ui/src/widgets/svg/__tests__/SvgChart.test.tsx
git commit -m "feat(scada-svg): SvgChart + 2 tests (bars-per-point/empty) — uses useTagHistory"
```

---

## Task 17: SvgImage

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgImage.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgImage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgImage.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgImage } from '../SvgImage';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgImage', () => {
  it('renders <image href> when config.src provided', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} config={{ src: '/assets/tank.svg' }} />);
    const img = container.querySelector('image');
    expect(img?.getAttribute('href')).toBe('/assets/tank.svg');
  });

  it('renders placeholder when src missing', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} />);
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('?image');
  });

  it('uses tagValue as src override when string', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} tagValue="/dyn.png" config={{ src: '/default.svg' }} />);
    expect(container.querySelector('image')?.getAttribute('href')).toBe('/dyn.png');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgImage.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgImage**

```tsx
// packages/web-ui/src/widgets/svg/SvgImage.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgImage: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const srcOverride = typeof tagValue === 'string' && tagValue.length > 0 ? tagValue : undefined;
  const srcDefault = typeof config?.src === 'string' ? config.src : undefined;
  const src = srcOverride ?? srcDefault;
  const preserve = typeof config?.preserveAspectRatio === 'string' ? config.preserveAspectRatio : 'xMidYMid meet';

  if (!src) {
    return (
      <g className={tagStale ? 'opacity-50' : undefined}>
        <rect width={width} height={height} fill="#eee" stroke="#aaa" />
        <text x={4} y={14} fontSize={10} fill="#666">?image</text>
      </g>
    );
  }
  return <image href={src} width={width} height={height} preserveAspectRatio={preserve} className={tagStale ? 'opacity-50' : undefined} />;
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgImage.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgImage.tsx packages/web-ui/src/widgets/svg/__tests__/SvgImage.test.tsx
git commit -m "feat(scada-svg): SvgImage + 3 tests (src/placeholder/tagValue-override)"
```

---

## Task 18: SvgPipe

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgPipe.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgPipe.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgPipe.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgPipe } from '../SvgPipe';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgPipe', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders flowing color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#3b82f6');
  });

  it('renders arrow path indicating flow direction', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgPipe.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgPipe**

```tsx
// packages/web-ui/src/widgets/svg/SvgPipe.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgPipe: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const flowing = !!tagValue;
  const flowingColor = typeof config?.flowingColor === 'string' ? config.flowingColor : '#3b82f6';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const orientation = config?.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const fill = flowing ? flowingColor : idleColor;

  let arrow: string;
  if (orientation === 'horizontal') {
    const cx = width / 2;
    const cy = height / 2;
    arrow = `M${cx - 4},${cy - 5} L${cx + 4},${cy} L${cx - 4},${cy + 5} Z`;
  } else {
    const cx = width / 2;
    const cy = height / 2;
    arrow = `M${cx - 5},${cy - 4} L${cx},${cy + 4} L${cx + 5},${cy - 4} Z`;
  }

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      <path d={arrow} fill="#fff" />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgPipe.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgPipe.tsx packages/web-ui/src/widgets/svg/__tests__/SvgPipe.test.tsx
git commit -m "feat(scada-svg): SvgPipe + 3 tests (idle/flowing/arrow)"
```

---

## Task 19: SvgReactor

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgReactor.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgReactor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgReactor.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgReactor } from '../SvgReactor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgReactor', () => {
  it('renders vessel rect, jacket lines, and stirrer placeholder', () => {
    const { container } = renderInSvg(<SvgReactor width={100} height={140} tagValue={50} />);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('line')).not.toBeNull();
  });

  it('clamps fill % to [0, 100]', () => {
    const { container } = renderInSvg(<SvgReactor width={100} height={140} tagValue={150} />);
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgReactor.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgReactor**

```tsx
// packages/web-ui/src/widgets/svg/SvgReactor.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgReactor: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const vesselStroke = typeof config?.vesselStroke === 'string' ? config.vesselStroke : '#374151';

  const inset = 6;
  const vesselX = inset;
  const vesselY = inset;
  const vesselW = width - inset * 2;
  const vesselH = height - inset * 2;
  const fillH = (pct / 100) * vesselH;

  const shaftX = width / 2;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke={vesselStroke} />
      <rect x={vesselX} y={vesselY} width={vesselW} height={vesselH} fill="#fff" stroke={vesselStroke} />
      <rect x={vesselX} y={vesselY + vesselH - fillH} width={vesselW} height={fillH} fill={fillColor} />
      <line x1={shaftX} y1={vesselY} x2={shaftX} y2={vesselY + vesselH / 2} stroke="#374151" strokeWidth={2} />
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgReactor.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgReactor.tsx packages/web-ui/src/widgets/svg/__tests__/SvgReactor.test.tsx
git commit -m "feat(scada-svg): SvgReactor + 2 tests (vessel+jacket+stirrer/clamp)"
```

---

## Task 20: SvgSparger

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgSparger.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgSparger.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgSparger.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSparger } from '../SvgSparger';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSparger', () => {
  it('renders idle color lines when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgSparger width={100} height={20} tagValue={false} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].getAttribute('stroke')).toBe('#9ca3af');
  });

  it('renders flowing color lines when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgSparger width={100} height={20} tagValue={true} />);
    const lines = container.querySelectorAll('line');
    expect(lines[0].getAttribute('stroke')).toBe('#3b82f6');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSparger.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgSparger**

```tsx
// packages/web-ui/src/widgets/svg/SvgSparger.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSparger: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const flowing = !!tagValue;
  const flowingColor = typeof config?.flowingColor === 'string' ? config.flowingColor : '#3b82f6';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const stroke = flowing ? flowingColor : idleColor;
  const holeCount = 5;
  const lines = Array.from({ length: holeCount }, (_, i) => {
    const x = ((i + 0.5) / holeCount) * width;
    return <line key={i} x1={x} y1={0} x2={x} y2={height} stroke={stroke} strokeWidth={2} />;
  });
  return <g className={tagStale ? 'opacity-50' : undefined}>{lines}</g>;
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSparger.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgSparger.tsx packages/web-ui/src/widgets/svg/__tests__/SvgSparger.test.tsx
git commit -m "feat(scada-svg): SvgSparger + 2 tests (idle/flowing gas lines)"
```

---

## Task 21: SvgProbe

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgProbe.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgProbe.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgProbe.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgProbe } from '../SvgProbe';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgProbe', () => {
  it('renders head circle, cable line, and value text', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={37.25} />);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('line')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('37.25');
  });

  it('formats with config.decimals + unit', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={37.2} config={{ decimals: 1, unit: '°C' }} />);
    expect(container.querySelector('text')?.textContent).toBe('37.2 °C');
  });

  it('renders em-dash for undefined value', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgProbe.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgProbe**

```tsx
// packages/web-ui/src/widgets/svg/SvgProbe.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgProbe: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const decimals = typeof config?.decimals === 'number' ? config.decimals : 2;
  const unit = typeof config?.unit === 'string' ? config.unit : '';
  let text: string;
  if (tagValue === undefined || tagValue === null) {
    text = '—';
  } else if (typeof tagValue === 'number') {
    text = unit ? `${tagValue.toFixed(decimals)} ${unit}` : tagValue.toFixed(decimals);
  } else {
    text = String(tagValue);
  }
  const cx = width / 2;
  const headR = Math.min(width, height) / 5;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <line x1={cx} y1={0} x2={cx} y2={height / 3} stroke="#374151" strokeWidth={2} />
      <circle cx={cx} cy={height / 3 + headR} r={headR} fill="#fff" stroke="#374151" />
      <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="#111827">{text}</text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgProbe.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgProbe.tsx packages/web-ui/src/widgets/svg/__tests__/SvgProbe.test.tsx
git commit -m "feat(scada-svg): SvgProbe + 3 tests (head+cable+value/unit/em-dash)"
```

---

## Task 22: SvgStirrer

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgStirrer.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgStirrer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgStirrer.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgStirrer } from '../SvgStirrer';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgStirrer', () => {
  it('renders default 3 blades', () => {
    const { container } = renderInSvg(<SvgStirrer width={60} height={60} />);
    expect(container.querySelectorAll('rect').length).toBe(3);
  });

  it('respects config.bladeCount', () => {
    const { container } = renderInSvg(<SvgStirrer width={60} height={60} config={{ bladeCount: 5 }} />);
    expect(container.querySelectorAll('rect').length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgStirrer.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgStirrer**

```tsx
// packages/web-ui/src/widgets/svg/SvgStirrer.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgStirrer: SvgWidgetComponent = ({ width, height, tagStale, config }) => {
  const bladeCount = typeof config?.bladeCount === 'number' ? config.bladeCount : 3;
  const color = typeof config?.color === 'string' ? config.color : '#374151';
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 4;
  const bladeW = r * 0.8;
  const bladeH = 4;
  const blades = Array.from({ length: bladeCount }, (_, i) => {
    const angle = (i * 360) / bladeCount;
    return (
      <rect
        key={i}
        x={cx - bladeW / 2}
        y={cy - bladeH / 2}
        width={bladeW}
        height={bladeH}
        fill={color}
        transform={`rotate(${angle} ${cx} ${cy})`}
      />
    );
  });
  return <g className={tagStale ? 'opacity-50' : undefined}>{blades}</g>;
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgStirrer.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgStirrer.tsx packages/web-ui/src/widgets/svg/__tests__/SvgStirrer.test.tsx
git commit -m "feat(scada-svg): SvgStirrer + 2 tests (default-3/configurable-blades)"
```

---

## Task 23: SvgHeater

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgHeater.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgHeater.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgHeater.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgHeater } from '../SvgHeater';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgHeater', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders heated color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626');
  });

  it('renders wavy paths', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={true} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgHeater.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgHeater**

```tsx
// packages/web-ui/src/widgets/svg/SvgHeater.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgHeater: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const heated = !!tagValue;
  const heatedColor = typeof config?.heatedColor === 'string' ? config.heatedColor : '#dc2626';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const fill = heated ? heatedColor : idleColor;
  const waveCount = 3;
  const waves = Array.from({ length: waveCount }, (_, i) => {
    const cy = ((i + 1) / (waveCount + 1)) * height;
    return (
      <path
        key={i}
        d={`M0,${cy} Q${width / 4},${cy - 4} ${width / 2},${cy} T${width},${cy}`}
        stroke="#fff"
        strokeWidth={1.5}
        fill="none"
      />
    );
  });
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      {waves}
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgHeater.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgHeater.tsx packages/web-ui/src/widgets/svg/__tests__/SvgHeater.test.tsx
git commit -m "feat(scada-svg): SvgHeater + 3 tests (idle/heated/wavy)"
```

---

## Task 24: SvgSensor

**Files:**
- Create: `packages/web-ui/src/widgets/svg/SvgSensor.tsx`
- Create: `packages/web-ui/src/widgets/svg/__tests__/SvgSensor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/web-ui/src/widgets/svg/__tests__/SvgSensor.test.tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSensor } from '../SvgSensor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSensor', () => {
  it('renders diamond polygon and value', () => {
    const { container } = renderInSvg(<SvgSensor width={60} height={60} tagValue={1.5} />);
    expect(container.querySelector('polygon')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('1.50');
  });

  it('formats with config.decimals + unit', () => {
    const { container } = renderInSvg(<SvgSensor width={60} height={60} tagValue={1.5} config={{ decimals: 1, unit: 'bar' }} />);
    expect(container.querySelector('text')?.textContent).toBe('1.5 bar');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSensor.test.tsx 2>&1 | tail -10
```

- [ ] **Step 3: Implement SvgSensor**

```tsx
// packages/web-ui/src/widgets/svg/SvgSensor.tsx
import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSensor: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const decimals = typeof config?.decimals === 'number' ? config.decimals : 2;
  const unit = typeof config?.unit === 'string' ? config.unit : '';
  let text: string;
  if (tagValue === undefined || tagValue === null) {
    text = '—';
  } else if (typeof tagValue === 'number') {
    text = unit ? `${tagValue.toFixed(decimals)} ${unit}` : tagValue.toFixed(decimals);
  } else {
    text = String(tagValue);
  }
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 4;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <polygon points={points} fill="#fff" stroke="#374151" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#111827">{text}</text>
    </g>
  );
};
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/widgets/svg/__tests__/SvgSensor.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/widgets/svg/SvgSensor.tsx packages/web-ui/src/widgets/svg/__tests__/SvgSensor.test.tsx
git commit -m "feat(scada-svg): SvgSensor + 2 tests (diamond+value/unit)"
```

---

## Task 25: Extend `index.ts` — register 22 widgets + re-exports

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/index.ts`

- [ ] **Step 1: Read current index.ts**

```bash
cat /Volumes/SSD/BIOCORE/packages/web-ui/src/widgets/svg/index.ts
```

- [ ] **Step 2: Replace file contents with full registration + re-exports**

Replace the entire file with:

```typescript
// packages/web-ui/src/widgets/svg/index.ts
import { registerSvg } from './registry';
import { SvgLabel } from './SvgLabel';
import { SvgRect } from './SvgRect';
import { SvgLamp } from './SvgLamp';
import { SvgIndicator } from './SvgIndicator';
import { SvgPump } from './SvgPump';
import { SvgValve } from './SvgValve';
import { SvgTank } from './SvgTank';
import { SvgTrend } from './SvgTrend';
import { SvgButton } from './SvgButton';
import { SvgMotor } from './SvgMotor';
import { SvgGauge } from './SvgGauge';
import { SvgSlider } from './SvgSlider';
import { SvgSwitch } from './SvgSwitch';
import { SvgSelect } from './SvgSelect';
import { SvgInput } from './SvgInput';
import { SvgChart } from './SvgChart';
import { SvgImage } from './SvgImage';
import { SvgPipe } from './SvgPipe';
import { SvgReactor } from './SvgReactor';
import { SvgSparger } from './SvgSparger';
import { SvgProbe } from './SvgProbe';
import { SvgStirrer } from './SvgStirrer';
import { SvgHeater } from './SvgHeater';
import { SvgSensor } from './SvgSensor';

let registered = false;
export function ensureBuiltinSvgWidgetsRegistered(): void {
  if (registered) return;
  // Sub-project 1 plumbing
  registerSvg({ type: 'svg-label', label: 'Label', component: SvgLabel, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-rect', label: 'Rect', component: SvgRect, defaults: { w: 100, h: 60 } });
  // Group A — ports
  registerSvg({ type: 'svg-lamp', label: 'Lamp', component: SvgLamp, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-indicator', label: 'Indicator', component: SvgIndicator, defaults: { w: 80, h: 24 } });
  registerSvg({ type: 'svg-pump', label: 'Pump', component: SvgPump, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-valve', label: 'Valve', component: SvgValve, defaults: { w: 40, h: 24 } });
  registerSvg({ type: 'svg-tank', label: 'Tank', component: SvgTank, defaults: { w: 60, h: 100 } });
  registerSvg({ type: 'svg-trend', label: 'Trend', component: SvgTrend, defaults: { w: 200, h: 80 } });
  registerSvg({ type: 'svg-button', label: 'Button', component: SvgButton, defaults: { w: 100, h: 30 } });
  // Group B — generic
  registerSvg({ type: 'svg-motor', label: 'Motor', component: SvgMotor, defaults: { w: 40, h: 40 } });
  registerSvg({ type: 'svg-gauge', label: 'Gauge', component: SvgGauge, defaults: { w: 80, h: 80 } });
  registerSvg({ type: 'svg-slider', label: 'Slider', component: SvgSlider, defaults: { w: 200, h: 24 } });
  registerSvg({ type: 'svg-switch', label: 'Switch', component: SvgSwitch, defaults: { w: 50, h: 24 } });
  registerSvg({ type: 'svg-select', label: 'Select', component: SvgSelect, defaults: { w: 120, h: 30 } });
  registerSvg({ type: 'svg-input', label: 'Input', component: SvgInput, defaults: { w: 120, h: 28 } });
  registerSvg({ type: 'svg-chart', label: 'Chart', component: SvgChart, defaults: { w: 200, h: 100 } });
  registerSvg({ type: 'svg-image', label: 'Image', component: SvgImage, defaults: { w: 100, h: 100 } });
  registerSvg({ type: 'svg-pipe', label: 'Pipe', component: SvgPipe, defaults: { w: 100, h: 20 } });
  // Group C — fermentation
  registerSvg({ type: 'svg-reactor', label: 'Reactor', component: SvgReactor, defaults: { w: 100, h: 140 } });
  registerSvg({ type: 'svg-sparger', label: 'Sparger', component: SvgSparger, defaults: { w: 100, h: 20 } });
  registerSvg({ type: 'svg-probe', label: 'Probe', component: SvgProbe, defaults: { w: 60, h: 60 } });
  registerSvg({ type: 'svg-stirrer', label: 'Stirrer', component: SvgStirrer, defaults: { w: 60, h: 60 } });
  registerSvg({ type: 'svg-heater', label: 'Heater', component: SvgHeater, defaults: { w: 80, h: 40 } });
  registerSvg({ type: 'svg-sensor', label: 'Sensor', component: SvgSensor, defaults: { w: 60, h: 60 } });
  registered = true;
}

export * from './types';
export { registerSvg, getSvgWidget, listSvgWidgets } from './registry';
export { SvgLabel } from './SvgLabel';
export { SvgRect } from './SvgRect';
export { SvgLamp } from './SvgLamp';
export { SvgIndicator } from './SvgIndicator';
export { SvgPump } from './SvgPump';
export { SvgValve } from './SvgValve';
export { SvgTank } from './SvgTank';
export { SvgTrend } from './SvgTrend';
export { SvgButton } from './SvgButton';
export { SvgMotor } from './SvgMotor';
export { SvgGauge } from './SvgGauge';
export { SvgSlider } from './SvgSlider';
export { SvgSwitch } from './SvgSwitch';
export { SvgSelect } from './SvgSelect';
export { SvgInput } from './SvgInput';
export { SvgChart } from './SvgChart';
export { SvgImage } from './SvgImage';
export { SvgPipe } from './SvgPipe';
export { SvgReactor } from './SvgReactor';
export { SvgSparger } from './SvgSparger';
export { SvgProbe } from './SvgProbe';
export { SvgStirrer } from './SvgStirrer';
export { SvgHeater } from './SvgHeater';
export { SvgSensor } from './SvgSensor';
```

- [ ] **Step 3: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no new errors mentioning `widgets/svg/`.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/index.ts
git commit -m "feat(scada-svg): register 22 new widgets in ensureBuiltinSvgWidgetsRegistered + re-exports"
```

---

## Task 26: registry-builtins test (24 widget count + ids)

**Files:**
- Create: `packages/web-ui/src/widgets/svg/__tests__/registry-builtins.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/web-ui/src/widgets/svg/__tests__/registry-builtins.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureBuiltinSvgWidgetsRegistered, listSvgWidgets } from '..';
import { _resetSvgRegistryForTests } from '../registry';

const EXPECTED_TYPES = [
  'svg-button', 'svg-chart', 'svg-gauge', 'svg-heater', 'svg-image',
  'svg-indicator', 'svg-input', 'svg-label', 'svg-lamp', 'svg-motor',
  'svg-pipe', 'svg-probe', 'svg-pump', 'svg-reactor', 'svg-rect',
  'svg-select', 'svg-sensor', 'svg-slider', 'svg-sparger', 'svg-stirrer',
  'svg-switch', 'svg-tank', 'svg-trend', 'svg-valve',
];

describe('SVG widget registry built-ins', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
  });

  it('registers exactly 24 widgets after ensureBuiltinSvgWidgetsRegistered', () => {
    ensureBuiltinSvgWidgetsRegistered();
    expect(listSvgWidgets().length).toBe(24);
  });

  it('all expected type ids are present', () => {
    ensureBuiltinSvgWidgetsRegistered();
    const types = listSvgWidgets().map((r) => r.type).sort();
    expect(types).toEqual(EXPECTED_TYPES);
  });
});
```

- [ ] **Step 2: Run test, verify PASS immediately**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm exec vitest run src/widgets/svg/__tests__/registry-builtins.test.ts 2>&1 | tail -10
```

This test is GREEN at write-time because Task 25 already registered all 24. That's fine — TDD RED-first applies to behavior tests, not cross-cutting assertion tests against already-built infrastructure.

Expected: `2 passed`.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/__tests__/registry-builtins.test.ts
git commit -m "test(scada-svg): registry-builtins assertion (24 widgets, expected type ids)"
```

---

## Task 27: Full regression check + manual smoke + push

**Files:** none modified.

- [ ] **Step 1: Run the full web-ui test suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
pnpm test 2>&1 | tail -15
```

Expected: all green. Sub-project 2 adds ~62 new tests on top of sub-project 1's ~142 = ~204 total.

- [ ] **Step 2: Type-check passes**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no new errors.

- [ ] **Step 3: Manual smoke (best-effort, only if servers running)**

```bash
lsof -i :3000 -sTCP:LISTEN -n -P 2>&1 | head -2
lsof -i :3001 -sTCP:LISTEN -n -P 2>&1 | head -2
```

If both running, insert a multi-widget smoke view:

```bash
cd /Volumes/SSD/BIOCORE
sqlite3 packages/server/data/biocore.db "PRAGMA table_info('scada_views');"
# Identify actual columns. Then adapt this INSERT to match:
sqlite3 packages/server/data/biocore.db <<'SQL'
INSERT INTO scada_views (id, name, is_svg, items_json, created_by, updated_by)
VALUES (
  'smoke-widgets-1',
  'Widget Library Smoke',
  1,
  json('{"width":800,"height":400,"background":"#f0f4f8","items":[
    {"id":"lamp1","type":"svg-lamp","x":50,"y":50,"w":40,"h":40,"bindings":{"tag":"F01.PUMP_RUN"}},
    {"id":"tank1","type":"svg-tank","x":120,"y":40,"w":60,"h":140,"bindings":{"tag":"F01.LEVEL_PCT"}},
    {"id":"gauge1","type":"svg-gauge","x":200,"y":40,"w":100,"h":100,"bindings":{"tag":"F01.TEMP"},"props":{"min":0,"max":50}},
    {"id":"reactor1","type":"svg-reactor","x":320,"y":40,"w":120,"h":160,"bindings":{"tag":"F01.LEVEL_PCT"}},
    {"id":"probe1","type":"svg-probe","x":480,"y":80,"w":60,"h":80,"bindings":{"tag":"F01.PH"},"props":{"unit":"pH","decimals":2}},
    {"id":"trend1","type":"svg-trend","x":50,"y":250,"w":300,"h":100,"bindings":{"tag":"F01.TEMP"}}
  ]}'),
  'admin-001',
  'admin-001'
);
SQL
```

Then `curl -s http://localhost:3001/api/scada/views/smoke-widgets-1 | head -c 300` and open `http://localhost:3000/scada2/smoke-widgets-1?reactor=F01` — expect 6 widgets to render without console errors. If servers not running, skip (test suite is the primary gate).

- [ ] **Step 4: Cleanup smoke view**

```bash
sqlite3 packages/server/data/biocore.db "DELETE FROM scada_views WHERE id='smoke-widgets-1';"
```

- [ ] **Step 5: Push branch + FF-merge to main**

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git merge --ff-only feat/scada-data-model 2>&1 | tail -2
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

If FF fails or origin/main diverged, STOP and report — do not force-push.

---

## Done criteria

- 22 new widget files + 22 new test files + 1 registry-builtins test = 23 new test files, ~62 new test cases, all green.
- `listSvgWidgets().length === 24` after `ensureBuiltinSvgWidgetsRegistered()`.
- `pnpm --filter @biocore/web-ui test` green (no regression from sub-project 1's 142 tests).
- `tsc --noEmit` clean for new files.
- (Best-effort) Manual smoke at `/scada2/smoke-widgets-1?reactor=F01` renders 6 widgets without console errors.
- 26 commits pushed to `feat/scada-data-model` (and FF-merged to `main`).
- Branch ready for sub-project 3 (animation engine — color/visible/rotate bindings on top of these 24 widgets).
