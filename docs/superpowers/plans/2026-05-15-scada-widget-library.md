# SCADA Widget 组件库实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@biocore/web-ui` 加 `src/widgets/` 模块: 8 个 dumb React widget 组件 + `WidgetDef` 判别联合类型 + `WIDGET_REGISTRY` + `BoundWidget` wrapper + `compileTransform` 表达式 eval + 31 vitest 单测 + README + 浏览器 DoD 验证。

**Architecture:** Pure presentational widgets (no hooks). `BoundWidget` wrapper 唯一接 `useTag` + transform eval, 合并 `defaultProps` + `widget.props` + binding-resolved props. Widget 通过 `WIDGET_REGISTRY[type].component` 动态查找。坐标系: px 绝对定位 in canvas (`x/y/w/h`)。

**Tech Stack:** TypeScript, React 18, Tailwind CSS, ECharts 5.5 (复用 EChartsWrapper), vitest 1.6, @testing-library/react 14, jsdom (sub-project 2 已就位).

**Spec reference:** `docs/superpowers/specs/2026-05-15-scada-widget-library-design.md`

---

## 文件结构

**新建** (在 `packages/web-ui/src/widgets/`):
- `types.ts` — WidgetTypeKey / Binding / BaseWidgetDef + 8 类型 + WidgetDef union + ItemsJson
- `transform.ts` — compileTransform + _resetCompileCache
- `Tank.tsx`, `Valve.tsx`, `Pump.tsx`, `Indicator.tsx`, `Trend.tsx`, `Label.tsx`, `Button.tsx`, `Lamp.tsx` — 8 dumb widget
- `registry.ts` — WIDGET_REGISTRY
- `BoundWidget.tsx` — wrapper
- `index.ts` — barrel
- `README.md` — widget 集 + props 表 + 用法
- `__tests__/transform.test.ts` (4) + `Tank.test.tsx` (3) + `Valve.test.tsx` (3) + `Pump.test.tsx` (3) + `Indicator.test.tsx` (3) + `Label.test.tsx` (2) + `Button.test.tsx` (3) + `Lamp.test.tsx` (3) + `Trend.test.tsx` (2) + `registry.test.ts` (1) + `BoundWidget.test.tsx` (4) = 31 用例

**不修改**: 不动 `hooks/`, `realtime-store`, server, data-service。

依赖: 无新 npm 包 (echarts/Tailwind/React/vitest/RTL/jsdom 全部 sub-project 2 就位)。

---

## Task 1: types.ts — WidgetDef 判别联合

**Files:**
- Create: `packages/web-ui/src/widgets/types.ts`

- [ ] **Step 1: 写 types.ts**

`packages/web-ui/src/widgets/types.ts`:

```ts
export type WidgetTypeKey = 'tank' | 'valve' | 'pump' | 'indicator' | 'trend' | 'label' | 'button' | 'lamp';

export interface Binding {
  tag: string;
  prop: string;
  transform?: string;
}

export interface BaseWidgetDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  bindings?: Binding[];
}

export interface TankDef extends BaseWidgetDef {
  type: 'tank';
  props: {
    fillPct?: number;
    max?: number;
    unit?: string;
    label?: string;
    color?: string;
  };
}

export interface ValveDef extends BaseWidgetDef {
  type: 'valve';
  props: {
    open?: boolean | number;
    label?: string;
    colorOpen?: string;
    colorClosed?: string;
  };
}

export interface PumpDef extends BaseWidgetDef {
  type: 'pump';
  props: {
    running?: boolean;
    rate?: number;
    unit?: string;
    label?: string;
  };
}

export interface IndicatorDef extends BaseWidgetDef {
  type: 'indicator';
  props: {
    value?: number | string | null;
    unit?: string;
    label?: string;
    precision?: number;
    color?: string;
  };
}

export interface TrendDef extends BaseWidgetDef {
  type: 'trend';
  props: {
    series: Array<{ tag: string; label?: string; color?: string }>;
    windowSec?: number;
    staleMs?: number;
    yMin?: number;
    yMax?: number;
  };
}

export interface LabelDef extends BaseWidgetDef {
  type: 'label';
  props: {
    text?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
  };
}

export interface ButtonDef extends BaseWidgetDef {
  type: 'button';
  props: {
    text?: string;
    action?: string;
    payload?: Record<string, any>;
    color?: string;
  };
}

export interface LampDef extends BaseWidgetDef {
  type: 'lamp';
  props: {
    on?: boolean;
    blink?: boolean;
    colorOn?: string;
    colorOff?: string;
    label?: string;
  };
}

export type WidgetDef =
  | TankDef | ValveDef | PumpDef | IndicatorDef
  | TrendDef | LabelDef | ButtonDef | LampDef;

export type ItemsJson = Record<string, WidgetDef>;
```

- [ ] **Step 2: TS 编译验证**

Run: `cd /Volumes/SSD/BIOCORE && npx tsc --noEmit -p packages/web-ui 2>&1 | tail -10`
Expected: 无新 error

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/types.ts
git commit -m "feat(web-ui): add widget types (WidgetDef discriminated union, 8 variants)"
```

---

## Task 2: transform.ts + 4 单测

**Files:**
- Create: `packages/web-ui/src/widgets/transform.ts`
- Create: `packages/web-ui/src/widgets/__tests__/transform.test.ts`

- [ ] **Step 1: 写测试 (RED)**

`packages/web-ui/src/widgets/__tests__/transform.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileTransform, _resetCompileCache } from '../transform';

describe('compileTransform', () => {
  beforeEach(() => {
    _resetCompileCache();
  });

  it('1. arithmetic expression', () => {
    const fn = compileTransform('v + 1');
    expect(fn(5)).toBe(6);
  });

  it('2. ternary returns string color', () => {
    const fn = compileTransform('v > 100 ? "red" : "green"');
    expect(fn(50)).toBe('green');
    expect(fn(150)).toBe('red');
  });

  it('3. cache hit returns same function reference', () => {
    const first = compileTransform('v * 2');
    const second = compileTransform('v * 2');
    expect(first).toBe(second);
  });

  it('4. invalid syntax falls back to identity + warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = compileTransform('invalid syntax {');
    expect(fn(42)).toBe(42);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 跑测试 RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test transform`
Expected: FAIL — module not found

- [ ] **Step 3: 写 transform.ts**

`packages/web-ui/src/widgets/transform.ts`:

```ts
const compileCache = new Map<string, (v: any) => any>();
const IDENTITY = (v: any) => v;

export function compileTransform(expr: string): (v: any) => any {
  if (!expr) return IDENTITY;
  const cached = compileCache.get(expr);
  if (cached) return cached;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('v', `return (${expr});`) as (v: any) => any;
    compileCache.set(expr, fn);
    return fn;
  } catch (e) {
    console.warn('[widget] transform compile failed:', expr, e);
    compileCache.set(expr, IDENTITY);
    return IDENTITY;
  }
}

export function _resetCompileCache(): void {
  compileCache.clear();
}
```

- [ ] **Step 4: 跑测试 GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test transform`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/transform.ts packages/web-ui/src/widgets/__tests__/transform.test.ts
git commit -m "feat(web-ui): add compileTransform (cached new Function eval) + 4 tests"
```

---

## Task 3: Tank widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Tank.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Tank.test.tsx`

- [ ] **Step 1: 写测试 (RED)**

`packages/web-ui/src/widgets/__tests__/Tank.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tank } from '../Tank';

describe('Tank', () => {
  it('1. fillPct=0 → fill rect height 0', () => {
    const { container } = render(<Tank fillPct={0} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]');
    expect(fillRect).toBeTruthy();
    expect(Number(fillRect!.getAttribute('height'))).toBe(0);
  });

  it('2. fillPct=50 → fill height ≈ half of inner', () => {
    const { container } = render(<Tank fillPct={50} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const fillH = Number(fillRect.getAttribute('height'));
    expect(fillH).toBeGreaterThan(80);
    expect(fillH).toBeLessThan(120);
  });

  it('3. fillPct=100 → fill height ≈ inner full', () => {
    const { container } = render(<Tank fillPct={100} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const fillH = Number(fillRect.getAttribute('height'));
    expect(fillH).toBeGreaterThanOrEqual(180);
    expect(fillH).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 2: 跑 RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Tank`
Expected: FAIL

- [ ] **Step 3: 写 Tank.tsx**

`packages/web-ui/src/widgets/Tank.tsx`:

```tsx
'use client';
import React from 'react';

export interface TankProps {
  fillPct?: number;
  max?: number;
  unit?: string;
  label?: string;
  color?: string;
  width: number;
  height: number;
}

export function Tank(props: TankProps) {
  const { fillPct = 50, max, unit, label, color = '#3b82f6', width, height } = props;
  const innerPad = 4;
  const labelOffset = label ? 18 : 0;
  const innerW = Math.max(0, width - innerPad * 2);
  const innerH = Math.max(0, height - innerPad * 2 - labelOffset);
  const clamped = Math.max(0, Math.min(100, fillPct));
  const fillH = (clamped / 100) * innerH;
  const fillY = innerPad + labelOffset + (innerH - fillH);

  return (
    <div className="relative w-full h-full">
      {label ? (
        <div className="absolute top-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
      <svg width={width} height={height} className="absolute inset-0">
        <rect
          x={innerPad}
          y={innerPad + labelOffset}
          width={innerW}
          height={innerH}
          rx={4}
          stroke="#6b7280"
          fill="none"
          strokeWidth={1.5}
        />
        <rect
          data-testid="tank-fill"
          x={innerPad}
          y={fillY}
          width={innerW}
          height={fillH}
          rx={2}
          fill={color}
          opacity={0.8}
        />
      </svg>
      {max !== undefined && unit ? (
        <div className="absolute bottom-0 left-0 right-0 text-[10px] text-center text-gray-500">
          max {max} {unit}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 跑 GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Tank`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Tank.tsx packages/web-ui/src/widgets/__tests__/Tank.test.tsx
git commit -m "feat(web-ui): add Tank widget + 3 tests"
```

---

## Task 4: Valve widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Valve.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Valve.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Valve.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Valve } from '../Valve';

describe('Valve', () => {
  it('1. open=false → fill uses colorClosed', () => {
    const { container } = render(
      <Valve open={false} colorOpen="#22c55e" colorClosed="#9ca3af" width={80} height={50} />
    );
    const path = container.querySelector('path[data-testid="valve-body"]');
    expect(path?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('2. open=true → fill uses colorOpen', () => {
    const { container } = render(
      <Valve open={true} colorOpen="#22c55e" colorClosed="#9ca3af" width={80} height={50} />
    );
    const path = container.querySelector('path[data-testid="valve-body"]');
    expect(path?.getAttribute('fill')).toBe('#22c55e');
  });

  it('3. open=75 (number) → renders "75%"', () => {
    const { getByText } = render(<Valve open={75} width={80} height={50} />);
    expect(getByText('75%')).toBeTruthy();
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Valve`
Expected: FAIL

- [ ] **Step 3: 写 Valve.tsx**

`packages/web-ui/src/widgets/Valve.tsx`:

```tsx
'use client';
import React from 'react';

export interface ValveProps {
  open?: boolean | number;
  label?: string;
  colorOpen?: string;
  colorClosed?: string;
  width: number;
  height: number;
}

export function Valve(props: ValveProps) {
  const { open = false, label, colorOpen = '#22c55e', colorClosed = '#9ca3af', width, height } = props;

  const isOpen = typeof open === 'number' ? open > 0 : !!open;
  const fill = isOpen ? colorOpen : colorClosed;

  const cx = width / 2;
  const cy = height / 2;
  const w = width * 0.7;
  const h = height * 0.7;
  const x0 = (width - w) / 2;
  const y0 = (height - h) / 2;
  const path = `M ${x0},${y0} L ${cx},${cy} L ${x0},${y0 + h} Z M ${x0 + w},${y0} L ${cx},${cy} L ${x0 + w},${y0 + h} Z`;

  const pctText = typeof open === 'number' ? `${Math.round(open)}%` : null;

  return (
    <div className="relative w-full h-full">
      <svg width={width} height={height}>
        <path
          data-testid="valve-body"
          d={path}
          fill={fill}
          stroke="#6b7280"
          strokeWidth={1.5}
        />
      </svg>
      {pctText ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
          {pctText}
        </div>
      ) : null}
      {label ? (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full text-xs text-gray-700 whitespace-nowrap">
          {label}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Valve`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Valve.tsx packages/web-ui/src/widgets/__tests__/Valve.test.tsx
git commit -m "feat(web-ui): add Valve widget (bow-tie SVG + percent label) + 3 tests"
```

---

## Task 5: Pump widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Pump.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Pump.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Pump.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Pump } from '../Pump';

describe('Pump', () => {
  it('1. running=false → no animate-spin class', () => {
    const { container } = render(<Pump running={false} width={80} height={80} />);
    const fan = container.querySelector('[data-testid="pump-fan"]');
    expect(fan?.className).not.toContain('animate-spin');
  });

  it('2. running=true → animate-spin class', () => {
    const { container } = render(<Pump running={true} width={80} height={80} />);
    const fan = container.querySelector('[data-testid="pump-fan"]');
    expect(fan?.className).toContain('animate-spin');
  });

  it('3. rate=120 unit=rpm → renders "120 rpm"', () => {
    const { getByText } = render(<Pump rate={120} unit="rpm" width={80} height={80} />);
    expect(getByText('120 rpm')).toBeTruthy();
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Pump`
Expected: FAIL

- [ ] **Step 3: 写 Pump.tsx**

`packages/web-ui/src/widgets/Pump.tsx`:

```tsx
'use client';
import React from 'react';

export interface PumpProps {
  running?: boolean;
  rate?: number;
  unit?: string;
  label?: string;
  width: number;
  height: number;
}

export function Pump(props: PumpProps) {
  const { running = false, rate, unit = 'rpm', label, width, height } = props;
  const size = Math.min(width, height) * 0.7;
  const cx = width / 2;
  const cy = height / 2;
  const r = size / 2;
  const fanClass = running ? 'animate-spin origin-center' : 'origin-center';

  const blade = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    const x2 = cx + r * 0.7 * Math.cos(rad);
    const y2 = cy + r * 0.7 * Math.sin(rad);
    return `M ${cx},${cy} L ${x2},${y2}`;
  };

  return (
    <div className="relative w-full h-full">
      {label ? (
        <div className="absolute top-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
      <svg width={width} height={height}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6b7280" strokeWidth={1.5} />
        <g data-testid="pump-fan" className={fanClass} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <path d={blade(0)} stroke="#3b82f6" strokeWidth={3} fill="none" />
          <path d={blade(120)} stroke="#3b82f6" strokeWidth={3} fill="none" />
          <path d={blade(240)} stroke="#3b82f6" strokeWidth={3} fill="none" />
        </g>
      </svg>
      {rate !== undefined ? (
        <div className="absolute bottom-0 left-0 right-0 text-xs text-center text-gray-700">
          {rate} {unit}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Pump`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Pump.tsx packages/web-ui/src/widgets/__tests__/Pump.test.tsx
git commit -m "feat(web-ui): add Pump widget (3-blade fan animate-spin) + 3 tests"
```

---

## Task 6: Indicator widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Indicator.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Indicator.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Indicator.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Indicator } from '../Indicator';

describe('Indicator', () => {
  it('1. value=37.5 precision=2 → "37.50"', () => {
    const { getByText } = render(<Indicator value={37.5} precision={2} width={100} height={50} />);
    expect(getByText('37.50')).toBeTruthy();
  });

  it('2. value=null → "—"', () => {
    const { getByText } = render(<Indicator value={null} width={100} height={50} />);
    expect(getByText('—')).toBeTruthy();
  });

  it('3. value="OK" (string) → renders as-is', () => {
    const { getByText } = render(<Indicator value="OK" width={100} height={50} />);
    expect(getByText('OK')).toBeTruthy();
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Indicator`
Expected: FAIL

- [ ] **Step 3: 写 Indicator.tsx**

`packages/web-ui/src/widgets/Indicator.tsx`:

```tsx
'use client';
import React from 'react';

export interface IndicatorProps {
  value?: number | string | null;
  unit?: string;
  label?: string;
  precision?: number;
  color?: string;
  width: number;
  height: number;
}

export function Indicator(props: IndicatorProps) {
  const { value, unit, label, precision = 1, color, width, height } = props;

  let display: string;
  if (value === null || value === undefined) {
    display = '—';
  } else if (typeof value === 'number') {
    display = Number.isFinite(value) ? value.toFixed(precision) : '—';
  } else {
    display = String(value);
  }

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ width, height }}
    >
      {label ? (
        <div className="text-xs text-gray-600 truncate w-full text-center">{label}</div>
      ) : null}
      <div className="flex items-baseline gap-1" style={color ? { color } : undefined}>
        <span className="text-2xl font-semibold tabular-nums">{display}</span>
        {unit ? <span className="text-xs text-gray-500">{unit}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Indicator`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Indicator.tsx packages/web-ui/src/widgets/__tests__/Indicator.test.tsx
git commit -m "feat(web-ui): add Indicator widget (number/string/null formatting) + 3 tests"
```

---

## Task 7: Label widget + 2 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Label.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Label.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Label.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Label } from '../Label';

describe('Label', () => {
  it('1. text rendered', () => {
    const { getByText } = render(<Label text="Hello" width={100} height={30} />);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('2. bold + fontSize + align center → style applied', () => {
    const { container } = render(
      <Label text="X" bold={true} fontSize={20} align="center" width={100} height={30} />
    );
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.fontWeight).toBe('bold');
    expect(span.style.fontSize).toBe('20px');
    const wrapper = span.parentElement as HTMLElement;
    expect(wrapper.style.justifyContent).toBe('center');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Label`
Expected: FAIL

- [ ] **Step 3: 写 Label.tsx**

`packages/web-ui/src/widgets/Label.tsx`:

```tsx
'use client';
import React from 'react';

export interface LabelProps {
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  width: number;
  height: number;
}

export function Label(props: LabelProps) {
  const { text = '', fontSize = 14, color, bold = false, align = 'left', width, height } = props;
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };

  return (
    <div
      className="w-full h-full flex items-center"
      style={{
        width,
        height,
        justifyContent: justifyMap[align],
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          color,
          fontWeight: bold ? 'bold' : undefined,
        }}
      >
        {text}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Label`
Expected: 2/2 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Label.tsx packages/web-ui/src/widgets/__tests__/Label.test.tsx
git commit -m "feat(web-ui): add Label widget (font/color/bold/align) + 2 tests"
```

---

## Task 8: Button widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Button.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Button.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('1. click dispatches widget-action CustomEvent with widgetId/action/payload', () => {
    const handler = vi.fn();
    document.addEventListener('widget-action', handler);
    const { getByRole } = render(
      <Button widgetId="w1" text="Go" action="open_dialog" payload={{ x: 1 }} width={80} height={30} />
    );
    fireEvent.click(getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ widgetId: 'w1', action: 'open_dialog', payload: { x: 1 } });
    document.removeEventListener('widget-action', handler);
  });

  it('2. text rendered', () => {
    const { getByText } = render(<Button widgetId="w1" text="Click me" width={80} height={30} />);
    expect(getByText('Click me')).toBeTruthy();
  });

  it('3. color → inline style backgroundColor', () => {
    const { getByRole } = render(<Button widgetId="w1" color="#ff0000" width={80} height={30} />);
    const btn = getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Button`
Expected: FAIL

- [ ] **Step 3: 写 Button.tsx**

`packages/web-ui/src/widgets/Button.tsx`:

```tsx
'use client';
import React from 'react';

export interface ButtonProps {
  widgetId: string;
  text?: string;
  action?: string;
  payload?: Record<string, any>;
  color?: string;
  width: number;
  height: number;
}

export function Button(props: ButtonProps) {
  const { widgetId, text = 'Action', action, payload, color = '#3b82f6', width, height } = props;

  const handleClick = () => {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(
      new CustomEvent('widget-action', {
        detail: { widgetId, action, payload },
      })
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded text-white text-sm font-medium px-3 py-1 hover:opacity-90 active:opacity-80"
      style={{
        width,
        height,
        backgroundColor: color,
      }}
    >
      {text}
    </button>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Button`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Button.tsx packages/web-ui/src/widgets/__tests__/Button.test.tsx
git commit -m "feat(web-ui): add Button widget (CustomEvent widget-action) + 3 tests"
```

---

## Task 9: Lamp widget + 3 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Lamp.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Lamp.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/Lamp.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Lamp } from '../Lamp';

describe('Lamp', () => {
  it('1. on=false → fill = colorOff', () => {
    const { container } = render(
      <Lamp on={false} colorOn="#ef4444" colorOff="#e5e7eb" width={40} height={40} />
    );
    const circle = container.querySelector('circle[data-testid="lamp"]');
    expect(circle?.getAttribute('fill')).toBe('#e5e7eb');
  });

  it('2. on=true → fill = colorOn', () => {
    const { container } = render(
      <Lamp on={true} colorOn="#ef4444" colorOff="#e5e7eb" width={40} height={40} />
    );
    const circle = container.querySelector('circle[data-testid="lamp"]');
    expect(circle?.getAttribute('fill')).toBe('#ef4444');
  });

  it('3. on=true + blink=true → wrapper has animate-pulse class', () => {
    const { container } = render(<Lamp on={true} blink={true} width={40} height={40} />);
    const wrapper = container.querySelector('[data-testid="lamp-wrapper"]');
    expect(wrapper?.className).toContain('animate-pulse');
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Lamp`
Expected: FAIL

- [ ] **Step 3: 写 Lamp.tsx**

`packages/web-ui/src/widgets/Lamp.tsx`:

```tsx
'use client';
import React from 'react';

export interface LampProps {
  on?: boolean;
  blink?: boolean;
  colorOn?: string;
  colorOff?: string;
  label?: string;
  width: number;
  height: number;
}

export function Lamp(props: LampProps) {
  const { on = false, blink = false, colorOn = '#ef4444', colorOff = '#e5e7eb', label, width, height } = props;
  const size = Math.min(width, height) * 0.7;
  const cx = width / 2;
  const cy = height / 2 - (label ? 6 : 0);
  const r = size / 2;
  const fill = on ? colorOn : colorOff;
  const wrapperClass = on && blink ? 'animate-pulse' : '';

  return (
    <div
      data-testid="lamp-wrapper"
      className={`relative w-full h-full ${wrapperClass}`}
    >
      <svg width={width} height={height}>
        <circle
          data-testid="lamp"
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          stroke="#6b7280"
          strokeWidth={1.5}
        />
      </svg>
      {label ? (
        <div className="absolute bottom-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Lamp`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Lamp.tsx packages/web-ui/src/widgets/__tests__/Lamp.test.tsx
git commit -m "feat(web-ui): add Lamp widget (circle + blink) + 3 tests"
```

---

## Task 10: Trend widget + 2 单测

**Files:**
- Create: `packages/web-ui/src/widgets/Trend.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/Trend.test.tsx`

- [ ] **Step 1: 验 EChartsWrapper export 形式**

Run: `cd /Volumes/SSD/BIOCORE && grep -E "^export" packages/web-ui/src/components/charts/EChartsWrapper.tsx | head -5`

如果是 `export default`, 测试 mock 用 `default`; 如果是 `export function EChartsWrapper` 或 `export const EChartsWrapper`, 用 named。 下面 mock 把两种都给, 兼容。

- [ ] **Step 2: 写测试 (RED)**

`packages/web-ui/src/widgets/__tests__/Trend.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/charts/EChartsWrapper', () => {
  const EChartsWrapper = (props: any) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  );
  return { __esModule: true, default: EChartsWrapper, EChartsWrapper };
});

vi.mock('@/hooks', () => ({
  useTagHistory: vi.fn(() => ({
    points: Array.from({ length: 5 }, (_, i) => ({ t: 1700000000000 + i * 1000, v: i + 1 })),
    isStale: false,
  })),
}));

import { Trend } from '../Trend';

describe('Trend', () => {
  it('1. series=[] → option.series length 0', () => {
    const { getByTestId } = render(<Trend series={[]} width={400} height={200} />);
    const node = getByTestId('echarts');
    const opt = JSON.parse(node.getAttribute('data-option')!);
    expect(opt.series).toBeDefined();
    expect(opt.series.length).toBe(0);
  });

  it('2. series=[{tag:"F01.AI-0"}] → option.series[0].data has 5 points', () => {
    const { getByTestId } = render(
      <Trend series={[{ tag: 'F01.AI-0' }]} width={400} height={200} />
    );
    const node = getByTestId('echarts');
    const opt = JSON.parse(node.getAttribute('data-option')!);
    expect(opt.series.length).toBe(1);
    expect(opt.series[0].data.length).toBe(5);
  });
});
```

- [ ] **Step 3: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Trend`
Expected: FAIL

- [ ] **Step 4: 写 Trend.tsx**

EChartsWrapper import 形式由 Step 1 决定. 默认假设 default export; 若是 named, 改第一行 import 为 `import { EChartsWrapper } from '...'`。

`packages/web-ui/src/widgets/Trend.tsx`:

```tsx
'use client';
import React, { useMemo } from 'react';
import EChartsWrapper from '@/components/charts/EChartsWrapper';
import { useTagHistory } from '@/hooks';

export interface TrendProps {
  series: Array<{ tag: string; label?: string; color?: string }>;
  windowSec?: number;
  staleMs?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
}

export function Trend(props: TrendProps) {
  const { series, windowSec = 60, staleMs, yMin, yMax, width, height } = props;

  const seriesData = series.map((s) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTagHistory(s.tag, { windowSec, staleMs })
  );

  const option = useMemo(() => {
    return {
      grid: { left: 40, right: 8, top: 20, bottom: 24 },
      xAxis: { type: 'time' as const },
      yAxis: {
        type: 'value' as const,
        min: yMin,
        max: yMax,
      },
      legend: { show: series.length > 1, top: 0 },
      tooltip: { trigger: 'axis' as const },
      series: series.map((s, i) => ({
        name: s.label ?? s.tag,
        type: 'line' as const,
        showSymbol: false,
        data: seriesData[i].points.map((p) => [p.t, p.v]),
        lineStyle: s.color ? { color: s.color } : undefined,
      })),
    };
  }, [series, seriesData, yMin, yMax]);

  return (
    <div style={{ width, height }}>
      <EChartsWrapper option={option} />
    </div>
  );
}
```

- [ ] **Step 5: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test Trend`
Expected: 2/2 PASS. 若 import 错 (default vs named), 调 import + mock 一致即可。

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/Trend.tsx packages/web-ui/src/widgets/__tests__/Trend.test.tsx
git commit -m "feat(web-ui): add Trend widget (echarts + useTagHistory N series) + 2 tests"
```

---

## Task 11: registry.ts + 1 单测

**Files:**
- Create: `packages/web-ui/src/widgets/registry.ts`
- Create: `packages/web-ui/src/widgets/__tests__/registry.test.ts`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY } from '../registry';
import type { WidgetTypeKey } from '../types';

describe('WIDGET_REGISTRY', () => {
  it('1. 8 entries, each with component/defaultProps/displayName', () => {
    const keys: WidgetTypeKey[] = ['tank', 'valve', 'pump', 'indicator', 'trend', 'label', 'button', 'lamp'];
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const entry = WIDGET_REGISTRY[k];
      expect(entry).toBeDefined();
      expect(typeof entry.component).toBe('function');
      expect(typeof entry.defaultProps).toBe('function');
      expect(typeof entry.displayName).toBe('string');
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(typeof entry.defaultProps()).toBe('object');
    }
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test registry`
Expected: FAIL

- [ ] **Step 3: 写 registry.ts**

`packages/web-ui/src/widgets/registry.ts`:

```ts
import React from 'react';
import { Tank } from './Tank';
import { Valve } from './Valve';
import { Pump } from './Pump';
import { Indicator } from './Indicator';
import { Trend } from './Trend';
import { Label } from './Label';
import { Button } from './Button';
import { Lamp } from './Lamp';

export interface WidgetEntry<P> {
  component: React.ComponentType<P & { width: number; height: number }>;
  defaultProps: () => P;
  displayName: string;
}

export const WIDGET_REGISTRY = {
  tank: {
    component: Tank,
    defaultProps: () => ({ fillPct: 50, max: 100, color: '#3b82f6' }),
    displayName: '罐体',
  },
  valve: {
    component: Valve,
    defaultProps: () => ({ open: false, colorOpen: '#22c55e', colorClosed: '#9ca3af' }),
    displayName: '阀门',
  },
  pump: {
    component: Pump,
    defaultProps: () => ({ running: false, rate: 0, unit: 'rpm' }),
    displayName: '泵',
  },
  indicator: {
    component: Indicator,
    defaultProps: () => ({ value: null as number | string | null, unit: '', precision: 1 }),
    displayName: '数字表',
  },
  trend: {
    component: Trend,
    defaultProps: () => ({ series: [] as Array<{ tag: string; label?: string; color?: string }>, windowSec: 60 }),
    displayName: '趋势图',
  },
  label: {
    component: Label,
    defaultProps: () => ({ text: '', fontSize: 14, align: 'left' as const }),
    displayName: '文本',
  },
  button: {
    component: Button,
    defaultProps: () => ({ text: 'Action', color: '#3b82f6' }),
    displayName: '按钮',
  },
  lamp: {
    component: Lamp,
    defaultProps: () => ({ on: false, colorOn: '#ef4444', colorOff: '#e5e7eb' }),
    displayName: '指示灯',
  },
} as const;

export type WidgetRegistry = typeof WIDGET_REGISTRY;
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test registry`
Expected: 1/1 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/registry.ts packages/web-ui/src/widgets/__tests__/registry.test.ts
git commit -m "feat(web-ui): add WIDGET_REGISTRY (type → component/defaultProps/displayName) + 1 test"
```

---

## Task 12: BoundWidget wrapper + 4 单测

**Files:**
- Create: `packages/web-ui/src/widgets/BoundWidget.tsx`
- Create: `packages/web-ui/src/widgets/__tests__/BoundWidget.test.tsx`

- [ ] **Step 1: 写测试**

`packages/web-ui/src/widgets/__tests__/BoundWidget.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks', () => ({
  useTag: vi.fn(() => ({ value: 75, isStale: false, ageMs: 100 })),
  useTagHistory: vi.fn(() => ({ points: [], isStale: false })),
}));

import { BoundWidget } from '../BoundWidget';
import * as hooks from '@/hooks';
import type { TankDef } from '../types';

describe('BoundWidget', () => {
  beforeEach(() => {
    vi.mocked(hooks.useTag).mockReturnValue({ value: 75, isStale: false, ageMs: 100 });
  });

  it('1. unknown widget.type → renders placeholder', () => {
    const widget = { id: 'x', type: 'unknown' as any, x: 0, y: 0, w: 50, h: 50, props: {} };
    const { container } = render(<BoundWidget widget={widget} />);
    expect(container.textContent).toContain('Unknown widget');
  });

  it('2. bindings=[] → defaultProps + widget.props merged, renders Tank', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#ff0000' },
    };
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]');
    expect(fillRect?.getAttribute('fill')).toBe('#ff0000');
  });

  it('3. binding without transform → useTag value passed to prop', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#3b82f6' },
      bindings: [{ tag: 'F01.AI-0', prop: 'fillPct' }],
    };
    vi.mocked(hooks.useTag).mockReturnValueOnce({ value: 75, isStale: false, ageMs: 100 });
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const h = Number(fillRect.getAttribute('height'));
    expect(h).toBeGreaterThan(100);
  });

  it('4. binding with transform → eval applied', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#3b82f6' },
      bindings: [{ tag: 'F01.AI-0', prop: 'fillPct', transform: 'v > 50 ? 100 : 0' }],
    };
    vi.mocked(hooks.useTag).mockReturnValueOnce({ value: 75, isStale: false, ageMs: 100 });
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const h = Number(fillRect.getAttribute('height'));
    expect(h).toBeGreaterThanOrEqual(160);
  });
});
```

- [ ] **Step 2: RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test BoundWidget`
Expected: FAIL

- [ ] **Step 3: 写 BoundWidget.tsx**

`packages/web-ui/src/widgets/BoundWidget.tsx`:

```tsx
'use client';
import React from 'react';
import { useTag } from '@/hooks';
import { WIDGET_REGISTRY } from './registry';
import { compileTransform } from './transform';
import type { WidgetDef, Binding } from './types';

export function BoundWidget({ widget }: { widget: WidgetDef }) {
  const entry = (WIDGET_REGISTRY as any)[widget.type];

  if (!entry) {
    return (
      <div
        style={{
          position: 'absolute',
          left: widget.x,
          top: widget.y,
          width: widget.w,
          height: widget.h,
          color: 'red',
          border: '1px dashed red',
          fontSize: 12,
          padding: 4,
        }}
      >
        Unknown widget: {widget.type}
      </div>
    );
  }

  const baseProps = { ...entry.defaultProps(), ...(widget as any).props };
  const boundProps = useBoundProps(baseProps, widget.bindings ?? []);

  const Component = entry.component as React.ComponentType<any>;
  return (
    <div
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        transform: widget.rotation ? `rotate(${widget.rotation}deg)` : undefined,
      }}
    >
      <Component {...boundProps} widgetId={widget.id} width={widget.w} height={widget.h} />
    </div>
  );
}

function useBoundProps(base: Record<string, any>, bindings: Binding[]): Record<string, any> {
  // NOTE: 循环内调 hook — Hook rules 要求 bindings 数组在 render 间长度稳定。
  // 容器层 (sub-project 4) 在 bindings 长度变化时通过 key 强制 remount。
  const merged = { ...base };
  for (const b of bindings) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const snap = useTag(b.tag);
    const fn = b.transform ? compileTransform(b.transform) : (v: any) => v;
    let resolved: any;
    try {
      resolved = fn(snap.value);
    } catch {
      resolved = snap.value;
    }
    merged[b.prop] = resolved;
  }
  return merged;
}
```

- [ ] **Step 4: GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test BoundWidget`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/BoundWidget.tsx packages/web-ui/src/widgets/__tests__/BoundWidget.test.tsx
git commit -m "feat(web-ui): add BoundWidget wrapper (defaultProps + bindings + transform eval) + 4 tests"
```

---

## Task 13: barrel + README + 手工 DoD

**Files:**
- Create: `packages/web-ui/src/widgets/index.ts`
- Create: `packages/web-ui/src/widgets/README.md`

- [ ] **Step 1: 写 barrel**

`packages/web-ui/src/widgets/index.ts`:

```ts
export type {
  WidgetTypeKey,
  Binding,
  BaseWidgetDef,
  TankDef, ValveDef, PumpDef, IndicatorDef,
  TrendDef, LabelDef, ButtonDef, LampDef,
  WidgetDef,
  ItemsJson,
} from './types';

export { Tank } from './Tank';
export { Valve } from './Valve';
export { Pump } from './Pump';
export { Indicator } from './Indicator';
export { Trend } from './Trend';
export { Label } from './Label';
export { Button } from './Button';
export { Lamp } from './Lamp';

export { WIDGET_REGISTRY } from './registry';
export type { WidgetEntry, WidgetRegistry } from './registry';

export { BoundWidget } from './BoundWidget';
export { compileTransform, _resetCompileCache } from './transform';
```

- [ ] **Step 2: 写 README**

`packages/web-ui/src/widgets/README.md`:

````markdown
# SCADA Widget Library

子项目 3/7. 为 SCADA 编辑器 (子项目 5) + 渲染层 (子项目 4) 提供 8 个基础 widget React 组件 + 类型契约 + BoundWidget wrapper。

## 8 widget 类型

| Type | 用途 | 关键 props |
|---|---|---|
| `tank` | 罐体液位 | `fillPct` (0-100), `color`, `label`, `max`, `unit` |
| `valve` | 阀门开关/调节 | `open` (boolean 或 0-100), `colorOpen`, `colorClosed` |
| `pump` | 泵运行状态 | `running` (boolean), `rate`, `unit`, `label` |
| `indicator` | 数字表 | `value` (number/string/null), `unit`, `precision`, `color` |
| `trend` | 多 tag 历史曲线 | `series: Array<{tag, label?, color?}>`, `windowSec`, `yMin`, `yMax` |
| `label` | 静态文本 | `text`, `fontSize`, `bold`, `align`, `color` |
| `button` | 触发动作 | `text`, `action`, `payload`, `color` (派发 `widget-action` CustomEvent) |
| `lamp` | 指示灯 | `on` (boolean), `blink`, `colorOn`, `colorOff` |

## 数据流

```
items_json (sub-project 1)
   → WidgetView (sub-project 4) — 遍历 items
   → BoundWidget (本子项目) — 应用 bindings + transform
   → Dumb widget (Tank/Valve/...) — 纯 props
```

## BoundWidget 用法

```tsx
import { BoundWidget } from '@/widgets';
import type { WidgetDef } from '@/widgets';

const widget: WidgetDef = {
  id: 'tank1',
  type: 'tank',
  x: 100, y: 50, w: 80, h: 200,
  props: { color: '#3b82f6', max: 100, unit: 'kg', label: '罐温' },
  bindings: [
    { tag: 'F01.AI-6', prop: 'fillPct' },
  ],
};

<BoundWidget widget={widget} />
```

### Transform 表达式

```tsx
bindings: [
  { tag: 'F01.AI-0', prop: 'color', transform: 'v > 100 ? "red" : "green"' },
  { tag: 'F01.AI-6', prop: 'fillPct', transform: 'Math.min(100, v / 50 * 100)' },
]
```

通过 `new Function('v', ...)` cached compile。 失败 → console.warn 一次 + 回退 identity。

## Button 动作

Button 不直写 PLC。 点击触发 `widget-action` CustomEvent on document, detail = `{ widgetId, action, payload }`. Runtime (sub-project 4) 接 listener 打开 audit dialog + POST 建议缓冲区。

```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    if (ce.detail.action === 'open_suggest_dialog') {
      // 打开 dialog with payload
    }
  };
  document.addEventListener('widget-action', handler);
  return () => document.removeEventListener('widget-action', handler);
}, []);
```

## 坐标系

- `x`, `y`, `w`, `h` 单位 = px (canvas 绝对定位)
- `rotation?` deg (默认 0)
- BoundWidget 用 `position: absolute` + inline style 应用

## Hook rules 注意

BoundWidget 内部 for-loop 调 `useTag`. 若 `bindings.length` 在 render 间变化, 会破坏 React Hook 顺序。

**缓解**: sub-project 4 渲染层在 bindings 长度变化时通过 `key={widget.id + ':' + (widget.bindings?.length ?? 0)}` 强制 remount。

## 不做

- 编辑器 UI (sub-project 5)
- WidgetView canvas mount + items_json 解析 (sub-project 4)
- Button 实际 PLC 写路径 (sub-project 4)
- 自定义 widget 扩展机制 (sub-project 6+)
````

- [ ] **Step 3: TS 编译 + 全测试套件**

Run: `cd /Volumes/SSD/BIOCORE && npx tsc --noEmit -p packages/web-ui 2>&1 | tail -10`
Expected: 无新 error

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test 2>&1 | tail -15`
Expected: 49/49 PASS (2 smoke + 10 useTag + 8 useTagHistory + 31 widget = 51 — 注: 实际可能因 smoke+hook 总数累加, 期望 49+ 全绿)

- [ ] **Step 4: Commit barrel + README**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/index.ts packages/web-ui/src/widgets/README.md
git commit -m "docs(web-ui): add widgets barrel + README with usage examples"
```

- [ ] **Step 5: 手工 DoD — demo 页**

建 `packages/web-ui/src/app/scada-demo/page.tsx`:

```tsx
'use client';
import React from 'react';
import { Tank, Valve, Pump, Indicator, Label, Button, Lamp, BoundWidget } from '@/widgets';

export default function ScadaDemoPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">SCADA Widget Demo</h1>

      <section>
        <h2 className="text-lg font-semibold mb-4">静态展示</h2>
        <div className="relative" style={{ height: 320, background: '#f9fafb' }}>
          <div style={{ position: 'absolute', left: 20, top: 20, width: 80, height: 200 }}>
            <Tank fillPct={65} color="#3b82f6" label="罐温" max={100} unit="°C" width={80} height={200} />
          </div>
          <div style={{ position: 'absolute', left: 120, top: 50, width: 80, height: 50 }}>
            <Valve open={true} label="V01" width={80} height={50} />
          </div>
          <div style={{ position: 'absolute', left: 120, top: 130, width: 80, height: 50 }}>
            <Valve open={45} width={80} height={50} />
          </div>
          <div style={{ position: 'absolute', left: 220, top: 50, width: 80, height: 80 }}>
            <Pump running={true} rate={120} unit="rpm" label="P01" width={80} height={80} />
          </div>
          <div style={{ position: 'absolute', left: 220, top: 150, width: 100, height: 60 }}>
            <Indicator value={37.5} unit="°C" label="罐温" precision={1} width={100} height={60} />
          </div>
          <div style={{ position: 'absolute', left: 340, top: 20, width: 120, height: 30 }}>
            <Label text="Reactor F01" fontSize={16} bold align="center" width={120} height={30} />
          </div>
          <div style={{ position: 'absolute', left: 340, top: 70, width: 100, height: 30 }}>
            <Button widgetId="b1" text="Start" action="open_suggest_dialog" payload={{ tag: 'F01.start' }} width={100} height={30} />
          </div>
          <div style={{ position: 'absolute', left: 340, top: 120, width: 40, height: 60 }}>
            <Lamp on={true} blink={true} label="Run" width={40} height={60} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">动态绑定 F01 (staleMs=70_000)</h2>
        <div className="relative" style={{ height: 250, background: '#f9fafb' }}>
          <BoundWidget widget={{
            id: 'd_tank', type: 'tank', x: 20, y: 20, w: 80, h: 200,
            props: { color: '#3b82f6', max: 50, unit: 'kg', label: '称重' },
            bindings: [{ tag: 'F01.AI-6', prop: 'fillPct', transform: 'Math.min(100, (v/50)*100)' }],
          }} />
          <BoundWidget widget={{
            id: 'd_ind', type: 'indicator', x: 120, y: 60, w: 120, h: 60,
            props: { unit: '°C', label: '罐温', precision: 1 },
            bindings: [{ tag: 'F01.AI-0', prop: 'value' }],
          }} />
          <BoundWidget widget={{
            id: 'd_trend', type: 'trend', x: 260, y: 20, w: 400, h: 200,
            props: { series: [{ tag: 'F01.AI-0', label: '罐温', color: '#ef4444' }], windowSec: 60, staleMs: 70_000 },
          }} />
        </div>
      </section>
    </div>
  );
}
```

跑 dev:
```bash
cd /Volumes/SSD/BIOCORE
pkill -f "tsx watch.*server" 2>/dev/null; pkill -f "next dev" 2>/dev/null
sleep 1
pnpm --filter @biocore/server dev > /tmp/dod-server.log 2>&1 &
pnpm --filter @biocore/web-ui dev > /tmp/dod-web.log 2>&1 &
sleep 18
grep -iE "listening|ready|error" /tmp/dod-server.log | head -3
grep -iE "ready|started|error" /tmp/dod-web.log | head -3
```

用 playwright headless:
- 打开 http://localhost:3000 → login admin/admin123 → 跳 `/scada-demo`
- screenshot 验 8 静态 widget 视觉
- 验动态 widget value 跟 pv_realtime 更新
- 验 Button click → console / event listener 看 widget-action event

- [ ] **Step 6: 清理**

```bash
cd /Volumes/SSD/BIOCORE
rm -rf packages/web-ui/src/app/scada-demo
pkill -f "tsx watch.*server" 2>/dev/null
pkill -f "next dev" 2>/dev/null
```

DoD 通过条件:
- 全 web-ui 测试套件 (smoke + hooks + widgets) 全绿
- 8 静态 widget 浏览器显示正确
- 3 动态 widget value 跟 pv_realtime 更新 (server tick 60s, staleMs=70_000 避免 stale)
- Button click 触发 CustomEvent

---

## 自检 (Self-Review)

**1. Spec coverage** (对照 `2026-05-15-scada-widget-library-design.md`):
- §1 架构 (BoundWidget + dumb widgets + registry) → Task 11/12 ✓
- §2 类型契约 (WidgetTypeKey 8, Binding, BaseWidgetDef, 8 类型 union, ItemsJson) → Task 1 ✓
- §3 WIDGET_REGISTRY → Task 11 ✓
- §4 BoundWidget wrapper + useBoundProps + Hook rules → Task 12 ✓
- §5 transform 表达式 (cached compile + fallback) → Task 2 ✓
- §6 8 widget 视觉规约 → Task 3-10 ✓
- §7 31 测试用例 → Tank3+Valve3+Pump3+Indicator3+Label2+Button3+Lamp3+Trend2+transform4+registry1+BoundWidget4 = 31 ✓
- §8 风险 — 文档级 ✓
- §9 文件结构 → Task 1-13 ✓
- §11 不做的事 — plan 不超范围 ✓

**2. Placeholder scan**: 无 TBD / TODO / "similar to Task N"。 每 step 有具体代码或具体命令。

**3. Type consistency**:
- `WidgetDef` union 在 Task 1, 后续 Task 11/12 import ✓
- `WidgetTypeKey` Task 1, Task 11 用作 keys 校验 ✓
- `Binding` 与 sub-project 1 spec `{tag, prop, transform?}` 一致 ✓
- `WIDGET_REGISTRY[type]` 含 `{component, defaultProps, displayName}` ✓
- `compileTransform` Task 2 export, Task 12 import ✓
- `BoundWidget` props `{widget: WidgetDef}` ✓
- `useTag` from `@/hooks` (子项目 2), `useTagHistory` 同 ✓
- Button `widgetId: string` extra prop — Task 8 实现 + Task 12 BoundWidget 注入 ✓

**4. 执行注意**:
- Task 10 (Trend) 先 grep EChartsWrapper export 形式 — Step 1 已加。 import + mock 一致即可
- Task 12 BoundWidget — sub-project 4 mount 时建议 key remount, 本子项目仅文档说明
- Task 13 demo 新增整目录 `scada-demo`, 清理用 rm -rf (不是 git checkout)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-scada-widget-library.md`.

用户已在 brainstorming + writing-plans skill 入口指示用 **Subagent-Driven (推荐)** 自动执行, 不再确认。直接进入 `superpowers:subagent-driven-development` skill 执行 Task 1-13 + final review。
