# SCADA Tag 订阅 Hook 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 BIOCore `@biocore/web-ui` 包加 `useTag` + `useTagHistory` 两个 React hook (含 16 个 vitest 单测 + README), 让 SCADA widget 直接订阅实时 PLC tag 流, 自带 stale 检测。

**Architecture:** Pure store selector — 复用现有 `realtime-store` (Zustand) 的 `reactorData[rid].processValues` + `trendBuffer`。新增 `_tick: number` 全局 1Hz tick 让 WS 断时 staleness 仍能 re-evaluate。 hook 无副作用 (除 ensureTick), 无 WS 连接, 无 store schema 改动。

**Tech Stack:** TypeScript, React 18, Zustand 4.4, vitest 1.x, @testing-library/react, jsdom。pnpm monorepo。

**Spec reference:** `docs/superpowers/specs/2026-05-15-scada-tag-subscription-hook-design.md`

---

## 文件结构

**新建**:
- `packages/web-ui/vitest.config.ts` — vitest jsdom env 配置
- `packages/web-ui/src/test/setup.ts` — testing-library cleanup hook
- `packages/web-ui/src/hooks/useTag.ts` — `useTag` + `parseTagId` + `ensureTick`
- `packages/web-ui/src/hooks/useTagHistory.ts` — `useTagHistory` + `TREND_FIELD_MAP`
- `packages/web-ui/src/hooks/index.ts` — barrel
- `packages/web-ui/src/hooks/__tests__/useTag.test.tsx` — 10 测试用例
- `packages/web-ui/src/hooks/__tests__/useTagHistory.test.tsx` — 6 测试用例
- `packages/web-ui/src/hooks/README.md` — 用法 + namespace 表 + 限制说明

**修改**:
- `packages/web-ui/package.json` — 加 vitest / @testing-library/react / jsdom 等 devDeps + `test` script
- `packages/web-ui/src/stores/realtime-store.ts` — `RealtimeState` interface 加 `_tick: number`, `create<>` 初值加 `_tick: 0`

依赖: zustand 4.4 (已有), React 18 (已有 Next.js), 新加 vitest + RTL + jsdom (devDeps)。

---

## Task 1: web-ui vitest 测试框架接入

**Files:**
- Modify: `packages/web-ui/package.json`
- Create: `packages/web-ui/vitest.config.ts`
- Create: `packages/web-ui/src/test/setup.ts`
- Create: `packages/web-ui/src/test/__smoke__.test.ts`

- [ ] **Step 1: 装 devDeps**

Run:
```bash
cd /Volumes/SSD/BIOCORE
pnpm --filter @biocore/web-ui add -D vitest@^1.2.0 @testing-library/react@^14 @testing-library/jest-dom@^6 @testing-library/dom@^9 jsdom@^24
```
Expected: lock 更新, 无 ERR_PNPM_NO_MATCHING_VERSION

- [ ] **Step 2: 加 test script 到 packages/web-ui/package.json**

读 `packages/web-ui/package.json`, 在 `"scripts"` 对象内加:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 写 vitest.config.ts**

`packages/web-ui/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 4: 写 setup.ts**

`packages/web-ui/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: 写 smoke test**

`packages/web-ui/src/test/__smoke__.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom env exposes document', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div').tagName).toBe('DIV');
  });
});
```

- [ ] **Step 6: 跑 smoke test 验证**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test`
Expected: 2/2 PASS

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/package.json packages/web-ui/vitest.config.ts packages/web-ui/src/test/setup.ts packages/web-ui/src/test/__smoke__.test.ts pnpm-lock.yaml
git commit -m "chore(web-ui): add vitest + @testing-library/react + jsdom test setup"
```

---

## Task 2: realtime-store 加 _tick 字段

**Files:**
- Modify: `packages/web-ui/src/stores/realtime-store.ts`

- [ ] **Step 1: 加字段到 RealtimeState interface**

在 `packages/web-ui/src/stores/realtime-store.ts` 找到 `interface RealtimeState {` 行 (约 line 86), 在该 interface 内的 `wsConnected: boolean;` 行之后添加:

```ts
  // 全局 1Hz tick — hook 用来周期性重判 staleness (即使 WS 断, store 不再 set, hook 仍能 re-eval)
  _tick: number;
```

- [ ] **Step 2: 加初值到 create<> store body**

找到 `export const useRealtimeStore = create<RealtimeState>((set, get) => ({` (约 line 146), 在该对象的 `wsConnected: false,` 行之后添加:

```ts
  _tick: 0,
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /Volumes/SSD/BIOCORE && npx tsc --noEmit -p packages/web-ui 2>&1 | tail -10`
Expected: 无 type error

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/stores/realtime-store.ts
git commit -m "feat(web-ui): add _tick field to realtime store for hook staleness re-eval"
```

---

## Task 3: useTag hook + 10 单测

**Files:**
- Create: `packages/web-ui/src/hooks/useTag.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useTag.test.tsx`

- [ ] **Step 1: 写测试 (RED)**

`packages/web-ui/src/hooks/__tests__/useTag.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTag } from '../useTag';

function resetStore() {
  useRealtimeStore.setState({
    wsConnected: false,
    _tick: 0,
    reactorData: {},
    processValues: null,
    stateUpdate: null,
    calculatedParams: null,
    alarms: [],
    cusumAlerts: [],
    cusumHistory: {},
    heartbeatStatus: null,
    stepProgress: null,
    aiSuggestions: [],
    softSensorData: null,
    reactorStates: {},
    reactorRecipes: {},
    trendBuffer: { timestamps: [], temperature: [], pH: [], DO: [], rpm: [], airflow: [] },
    batchRuntime: {},
    recentBranchEvaluations: [],
  });
}

function seedReactor(opts: {
  reactorId?: string;
  processValues?: any;
  wsConnected?: boolean;
  now?: number;
}) {
  const {
    reactorId = 'F01',
    processValues = null,
    wsConnected = true,
    now = Date.now(),
  } = opts;
  useRealtimeStore.setState({
    wsConnected,
    _tick: now,
    reactorData: {
      [reactorId]: {
        processValues,
        stateUpdate: null,
        calculatedParams: null,
        alarms: [],
        cusumAlerts: [],
        cusumHistory: {},
        softSensorData: null,
        trendBuffer: { timestamps: [], temperature: [], pH: [], DO: [], rpm: [], airflow: [] },
      },
    },
  });
}

describe('useTag', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. 合法 tag + 新鲜值 → value 正确 isStale=false ageMs 小', () => {
    const now = new Date('2026-05-15T10:00:00Z').getTime();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: '2026-05-15T10:00:00Z', 'AI-0': 37.5, batch_id: 'b1' },
      now,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(false);
    expect(result.current.ageMs).toBeLessThan(1000);
  });

  it('2. age > staleMs → isStale=true', () => {
    const start = new Date('2026-05-15T10:00:00Z').getTime();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: '2026-05-15T10:00:00Z', 'AI-0': 37.5 },
      now: start,
    });
    vi.setSystemTime(start + 10_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 10_000 });
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBeGreaterThanOrEqual(10_000);
  });

  it('3. tagId 缺 "." → null + stale', () => {
    seedReactor({ processValues: { timestamp: new Date().toISOString(), 'AI-0': 37.5 } });
    const { result } = renderHook(() => useTag('F01AI0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBe(Infinity);
  });

  it('4. tagId 多于一个 "." → null + stale', () => {
    seedReactor({ processValues: { timestamp: new Date().toISOString(), 'AI-0': 37.5 } });
    const { result } = renderHook(() => useTag('F01.AI.0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('5. field 不在 ProcessValues 白名单 → null + stale', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: new Date(now).toISOString(), 'AI-0': 37.5 },
      now,
    });
    const { result } = renderHook(() => useTag('F01.UNKNOWN_FIELD'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('6. reactorData[rid] undefined → null + stale', () => {
    seedReactor({
      reactorId: 'F01',
      processValues: { timestamp: new Date().toISOString(), 'AI-0': 1 },
    });
    const { result } = renderHook(() => useTag('F99.AI-0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
    expect(result.current.ageMs).toBe(Infinity);
  });

  it('7. processValues=null → null + stale', () => {
    seedReactor({ processValues: null, wsConnected: true });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBeNull();
    expect(result.current.isStale).toBe(true);
  });

  it('8. wsConnected=false → 强制 isStale=true 即使 ageMs 小', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    seedReactor({
      processValues: { timestamp: new Date(now).toISOString(), 'AI-0': 37.5 },
      now,
      wsConnected: false,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(true);
  });

  it('9. staleMs 自定义 10000 → 5s 后仍不 stale', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: new Date(start).toISOString(), 'AI-0': 37.5 },
      now: start,
    });
    vi.setSystemTime(start + 5_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 5_000 });
    });
    const { result } = renderHook(() => useTag('F01.AI-0', { staleMs: 10_000 }));
    expect(result.current.value).toBe(37.5);
    expect(result.current.isStale).toBe(false);
  });

  it('10. tick 触发后 ageMs 涨', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    seedReactor({
      processValues: { timestamp: new Date(start).toISOString(), 'AI-0': 37.5 },
      now: start,
    });
    const { result } = renderHook(() => useTag('F01.AI-0'));
    expect(result.current.ageMs).toBeLessThan(1000);

    vi.setSystemTime(start + 2_000);
    act(() => {
      useRealtimeStore.setState({ _tick: start + 2_000 });
    });
    expect(result.current.ageMs).toBeGreaterThanOrEqual(2_000);
  });
});
```

- [ ] **Step 2: 跑测试看 RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test useTag`
Expected: FAIL — `Cannot find module '../useTag'`

- [ ] **Step 3: 写 useTag.ts 实现**

`packages/web-ui/src/hooks/useTag.ts`:

```ts
import { useEffect } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

export interface UseTagOpts {
  staleMs?: number;
}

export interface TagSnapshot {
  value: number | null;
  isStale: boolean;
  ageMs: number;
}

const DEFAULT_STALE_MS = 5000;

const PROCESS_VALUES_FIELDS = new Set<string>([
  'AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4', 'AI-5', 'AI-6',
  'AO-0_cv', 'AO-1_cv', 'AO-2_cv',
  'P01_rate', 'P02_rate', 'P03_rate', 'P04_rate',
  'rpm', 'vfd_current', 'temp_sv', 'temp_mode',
]);

export interface ParsedTagId {
  reactorId: string;
  field: string;
}

export function parseTagId(tagId: string): ParsedTagId | null {
  if (typeof tagId !== 'string') return null;
  const parts = tagId.split('.');
  if (parts.length !== 2) return null;
  const [reactorId, field] = parts;
  if (!reactorId || !field) return null;
  return { reactorId, field };
}

let tickStarted = false;
export function ensureTick(): void {
  if (tickStarted) return;
  if (typeof window === 'undefined') return;
  tickStarted = true;
  setInterval(() => {
    useRealtimeStore.setState({ _tick: Date.now() });
  }, 1000);
}

const STALE_SNAPSHOT: TagSnapshot = Object.freeze({
  value: null,
  isStale: true,
  ageMs: Infinity,
});

export function useTag(tagId: string, opts: UseTagOpts = {}): TagSnapshot {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  useEffect(() => {
    ensureTick();
  }, []);

  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const tick = useRealtimeStore((s) => s._tick);
  const parsed = parseTagId(tagId);
  const reactorData = useRealtimeStore((s) =>
    parsed ? s.reactorData[parsed.reactorId] : undefined
  );

  if (!parsed) return STALE_SNAPSHOT;
  if (!reactorData || !reactorData.processValues) return STALE_SNAPSHOT;
  if (!PROCESS_VALUES_FIELDS.has(parsed.field)) return STALE_SNAPSHOT;

  const pv = reactorData.processValues as Record<string, any>;
  const raw = pv[parsed.field];
  const value = typeof raw === 'number' ? raw : null;

  let ageMs = Infinity;
  if (pv.timestamp) {
    const ts = new Date(pv.timestamp).getTime();
    if (!Number.isNaN(ts)) {
      ageMs = Date.now() - ts;
    }
  }
  void tick;

  const isStale = value === null || !wsConnected || ageMs > staleMs;

  return { value, isStale, ageMs };
}
```

- [ ] **Step 4: 跑测试看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test useTag`
Expected: 10/10 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/useTag.ts packages/web-ui/src/hooks/__tests__/useTag.test.tsx
git commit -m "feat(web-ui): add useTag hook with staleness detection + 10 unit tests"
```

---

## Task 4: useTagHistory hook + 6 单测

**Files:**
- Create: `packages/web-ui/src/hooks/useTagHistory.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useTagHistory.test.tsx`

- [ ] **Step 1: 写测试 (RED)**

`packages/web-ui/src/hooks/__tests__/useTagHistory.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useTagHistory } from '../useTagHistory';

function makeTimestamps(count: number, intervalSec = 1, anchor?: number): string[] {
  const start = anchor ?? (Date.now() - count * intervalSec * 1000);
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * intervalSec * 1000).toISOString()
  );
}

function seedTrend(reactorId: string, trend: {
  timestamps: string[];
  temperature?: number[];
  pH?: number[];
  DO?: number[];
  rpm?: number[];
  airflow?: number[];
}) {
  const filled = {
    timestamps: trend.timestamps,
    temperature: trend.temperature ?? [],
    pH: trend.pH ?? [],
    DO: trend.DO ?? [],
    rpm: trend.rpm ?? [],
    airflow: trend.airflow ?? [],
  };
  useRealtimeStore.setState({
    wsConnected: true,
    _tick: Date.now(),
    reactorData: {
      [reactorId]: {
        processValues: { timestamp: trend.timestamps[trend.timestamps.length - 1] ?? new Date().toISOString() } as any,
        stateUpdate: null,
        calculatedParams: null,
        alarms: [],
        cusumAlerts: [],
        cusumHistory: {},
        softSensorData: null,
        trendBuffer: filled,
      },
    },
  });
}

function resetStore() {
  useRealtimeStore.setState({
    wsConnected: false,
    _tick: 0,
    reactorData: {},
    processValues: null,
    stateUpdate: null,
    calculatedParams: null,
    alarms: [],
    cusumAlerts: [],
    cusumHistory: {},
    heartbeatStatus: null,
    stepProgress: null,
    aiSuggestions: [],
    softSensorData: null,
    reactorStates: {},
    reactorRecipes: {},
    trendBuffer: { timestamps: [], temperature: [], pH: [], DO: [], rpm: [], airflow: [] },
    batchRuntime: {},
    recentBranchEvaluations: [],
  });
}

describe('useTagHistory', () => {
  beforeEach(() => {
    resetStore();
  });

  it('1. store 注 60 点, windowSec=60 → points.length = 60', () => {
    const timestamps = makeTimestamps(60, 1);
    const temperature = Array.from({ length: 60 }, (_, i) => 37 + i * 0.01);
    seedTrend('F01', { timestamps, temperature });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    expect(result.current.points.length).toBe(60);
    expect(result.current.isStale).toBe(false);
  });

  it('2. windowSec huge → clamp 到现有点数', () => {
    const timestamps = makeTimestamps(100, 1);
    const temperature = Array.from({ length: 100 }, (_, i) => i);
    seedTrend('F01', { timestamps, temperature });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 99999 }));
    expect(result.current.points.length).toBe(100);
  });

  it('3. reactor 未连 → points=[], isStale=true', () => {
    const { result } = renderHook(() => useTagHistory('F99.AI-0', { windowSec: 60 }));
    expect(result.current.points).toEqual([]);
    expect(result.current.isStale).toBe(true);
  });

  it('4. field 映射: AI-0→temperature, AI-2→pH; AI-1 不在 mapping → []', () => {
    const timestamps = makeTimestamps(5, 1);
    seedTrend('F01', {
      timestamps,
      temperature: [10, 11, 12, 13, 14],
      pH: [7.0, 7.1, 7.2, 7.3, 7.4],
    });

    const { result: r1 } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    expect(r1.current.points.map((p) => p.v)).toEqual([10, 11, 12, 13, 14]);

    const { result: r2 } = renderHook(() => useTagHistory('F01.AI-2', { windowSec: 60 }));
    expect(r2.current.points.map((p) => p.v)).toEqual([7.0, 7.1, 7.2, 7.3, 7.4]);

    const { result: r3 } = renderHook(() => useTagHistory('F01.AI-1', { windowSec: 60 }));
    expect(r3.current.points).toEqual([]);
  });

  it('5. windowSec=0 → points=[]', () => {
    const timestamps = makeTimestamps(10, 1);
    seedTrend('F01', { timestamps, temperature: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 0 }));
    expect(result.current.points).toEqual([]);
  });

  it('6. points 按 t 升序', () => {
    const timestamps = makeTimestamps(10, 1);
    seedTrend('F01', { timestamps, temperature: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] });
    const { result } = renderHook(() => useTagHistory('F01.AI-0', { windowSec: 60 }));
    const pts = result.current.points;
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    }
  });
});
```

- [ ] **Step 2: 跑测试看 RED**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test useTagHistory`
Expected: FAIL — 模块未找到

- [ ] **Step 3: 写 useTagHistory.ts 实现**

`packages/web-ui/src/hooks/useTagHistory.ts`:

```ts
import { useRealtimeStore } from '@/stores/realtime-store';
import { parseTagId } from './useTag';

export interface UseTagHistoryOpts {
  windowSec?: number;
}

export interface TagHistoryPoint {
  t: number;
  v: number;
}

export interface TagHistory {
  points: TagHistoryPoint[];
  isStale: boolean;
}

const DEFAULT_WINDOW_SEC = 60;

const TREND_FIELD_MAP: Record<string, 'temperature' | 'pH' | 'DO' | 'rpm' | 'airflow'> = {
  'AI-0': 'temperature',
  'AI-2': 'pH',
  'AI-3': 'DO',
  'AI-5': 'airflow',
  rpm: 'rpm',
};

const EMPTY_HISTORY: TagHistory = Object.freeze({ points: [], isStale: true });

export function useTagHistory(tagId: string, opts: UseTagHistoryOpts = {}): TagHistory {
  const windowSec = opts.windowSec ?? DEFAULT_WINDOW_SEC;
  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const parsed = parseTagId(tagId);
  const reactorData = useRealtimeStore((s) =>
    parsed ? s.reactorData[parsed.reactorId] : undefined
  );

  if (!parsed) return EMPTY_HISTORY;
  if (!reactorData) return EMPTY_HISTORY;
  if (windowSec <= 0) return { points: [], isStale: !wsConnected };

  const bufferKey = TREND_FIELD_MAP[parsed.field];
  if (!bufferKey) return { points: [], isStale: !wsConnected };

  const trend = reactorData.trendBuffer;
  const timestamps = trend.timestamps;
  const values = trend[bufferKey];
  if (!timestamps.length || !values.length) {
    return { points: [], isStale: !wsConnected };
  }

  const n = Math.min(timestamps.length, values.length);
  const cutoffMs = Date.now() - windowSec * 1000;
  const points: TagHistoryPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(timestamps[i]).getTime();
    if (Number.isNaN(t)) continue;
    if (t < cutoffMs) continue;
    points.push({ t, v: values[i] });
  }

  return { points, isStale: !wsConnected };
}
```

- [ ] **Step 4: 跑测试看 GREEN**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test useTagHistory`
Expected: 6/6 PASS

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/useTagHistory.ts packages/web-ui/src/hooks/__tests__/useTagHistory.test.tsx
git commit -m "feat(web-ui): add useTagHistory hook + 6 unit tests"
```

---

## Task 5: hooks barrel + README

**Files:**
- Create: `packages/web-ui/src/hooks/index.ts`
- Create: `packages/web-ui/src/hooks/README.md`

- [ ] **Step 1: 写 barrel**

`packages/web-ui/src/hooks/index.ts`:

```ts
export { useTag, parseTagId, ensureTick } from './useTag';
export type { UseTagOpts, TagSnapshot, ParsedTagId } from './useTag';

export { useTagHistory } from './useTagHistory';
export type { UseTagHistoryOpts, TagHistory, TagHistoryPoint } from './useTagHistory';
```

注: 现存 `useAudit.tsx`, `useAuth.tsx`, `useTheme.ts` 不在本 barrel — 保持现状, 避免 unrelated 改动。

- [ ] **Step 2: 写 README**

`packages/web-ui/src/hooks/README.md`:

````markdown
# SCADA Tag Subscription Hooks

为 SCADA widget (子项目 3+) 提供 React hook, 把 BIOCore 实时 PLC tag 流投影成 widget 可消费的当下值/历史。

## API

### useTag

```tsx
const { value, isStale, ageMs } = useTag('F01.AI-0');
const { value } = useTag('F01.AI-0', { staleMs: 10_000 });
```

返 `TagSnapshot`:
- `value: number | null` — 当下值, null 表 tag 不存在 / reactor 未连 / 从未收到 pv
- `isStale: boolean` — true 当 age > staleMs (默认 5000) 或 value=null 或 WS 断
- `ageMs: number` — 距 processValues.timestamp 毫秒数, Infinity 当无值

### useTagHistory

```tsx
const { points, isStale } = useTagHistory('F01.AI-0', { windowSec: 300 });
```

返 `TagHistory`:
- `points: Array<{ t: number; v: number }>` — 升序 by t (ms epoch), 仅返时间窗口内
- `isStale: boolean` — 同 useTag, 主要反映 WS 状态

## Tag Namespace

格式: `<reactor_id>.<field>`.

### 支持的 useTag field

| 类别 | Field | 含义 |
|---|---|---|
| 模拟输入 | `AI-0` | 罐温 °C |
| 模拟输入 | `AI-1` | 夹套温度 °C |
| 模拟输入 | `AI-2` | pH |
| 模拟输入 | `AI-3` | DO % |
| 模拟输入 | `AI-4` | 罐压 bar |
| 模拟输入 | `AI-5` | 空气流量 NL/min |
| 模拟输入 | `AI-6` | 称重 kg |
| 模拟输出 cv | `AO-0_cv` | 蒸汽阀开度 % |
| 模拟输出 cv | `AO-1_cv` | 冷却阀开度 % |
| 模拟输出 cv | `AO-2_cv` | 空气阀开度 % |
| 泵速率 | `P01_rate` | 碱泵速率 |
| 泵速率 | `P02_rate` | 补料泵速率 |
| 泵速率 | `P03_rate` | 氮源泵速率 |
| 泵速率 | `P04_rate` | 酸泵速率 |
| 标量 | `rpm` | 搅拌转速 |
| 标量 | `vfd_current` | 变频器电流 |
| 标量 | `temp_sv` | 温度设定值 °C |
| 标量 | `temp_mode` | 0=保温 1=加热 2=冷却 |

### 支持的 useTagHistory field

仅 5 个核心 tag (复用现有 store trendBuffer):
- `AI-0` (罐温)
- `AI-2` (pH)
- `AI-3` (DO)
- `AI-5` (空气流量)
- `rpm`

其它 field 用 useTagHistory 返 `{ points: [], isStale: !wsConnected }`. 不抛错, 只是无数据。

## 边界

- TagId 必须含恰好一个 `.` — 不然返 null + stale
- field 必须在白名单 — 不然返 null + stale
- reactor 从未连接 → null + stale
- WS 断 → value 冻最后, isStale=true (1Hz tick 重新评估)

## 不做

- state_update / alarm / cusum / soft_sensor 派生 tag (后续按需扩)
- transform 表达式 (留给 widget 渲染层)
- 写 PLC tag (永远走"建议缓冲区"-engine, 非 widget 责任)

## Examples

```tsx
// Tank widget — 称重 → 液位
import { useTag } from '@/hooks';
function Tank({ tag }: { tag: string }) {
  const { value, isStale } = useTag(tag);
  return <div className={isStale ? 'opacity-50' : ''}>{value?.toFixed(1) ?? '—'} kg</div>;
}
<Tank tag="F01.AI-6" />;
```

```tsx
// Trend chart — 5 分钟窗口
import { useTagHistory } from '@/hooks';
function TempTrend({ tag }: { tag: string }) {
  const { points } = useTagHistory(tag, { windowSec: 300 });
  return <Line data={points} />;
}
<TempTrend tag="F01.AI-0" />;
```
````

- [ ] **Step 3: 验证 barrel 编译**

Run: `cd /Volumes/SSD/BIOCORE && npx tsc --noEmit -p packages/web-ui 2>&1 | tail -10`
Expected: 无 type error

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/index.ts packages/web-ui/src/hooks/README.md
git commit -m "docs(web-ui): add hooks barrel + README with tag namespace + usage examples"
```

---

## Task 6: 手工 DoD 验证

**Files:** 无新文件, 跑命令验证

- [ ] **Step 1: 全 web-ui 测试套件跑过**

Run: `cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/web-ui test 2>&1 | tail -20`
Expected: 16 个 hook 用例 + 2 smoke = 18/18 PASS

- [ ] **Step 2: 起 dev server + web-ui**

```bash
cd /Volumes/SSD/BIOCORE
pkill -f "tsx watch.*server" 2>/dev/null; pkill -f "next dev" 2>/dev/null
sleep 1
pnpm --filter @biocore/server dev > /tmp/dod-server.log 2>&1 &
pnpm --filter @biocore/web-ui dev > /tmp/dod-web.log 2>&1 &
sleep 15
grep -iE "listening|ready|error" /tmp/dod-server.log | head -3
grep -iE "ready|started|error" /tmp/dod-web.log | head -3
```
Expected: server listening on 3001, next ready on 3000

- [ ] **Step 3: 临时加 useTag 探针到 dashboard 主页**

找到 dashboard 主页:
```bash
ls packages/web-ui/src/app/dashboard/*.tsx 2>/dev/null
```

在 `packages/web-ui/src/app/dashboard/page.tsx` (或第一个 dashboard 页文件) 顶部加 import + 在主组件 return 之前加 hook 调用:

```tsx
import { useTag } from '@/hooks';
// ...
// 在主组件 function body 内, return 之前:
const probe = useTag('F01.AI-0');
```

在 return 的 JSX 第一行加临时探针块:
```tsx
<div style={{position:'fixed', top: 8, right: 8, background: 'yellow', padding: 8, zIndex: 9999, fontFamily: 'monospace', fontSize: 12}}>
  [PROBE] F01.AI-0 = {String(probe.value)} stale={String(probe.isStale)} age={probe.ageMs === Infinity ? '∞' : `${probe.ageMs.toFixed(0)}ms`}
</div>
```

打开浏览器 http://localhost:3000 → login admin/admin123 → /dashboard。
Expected: 黄色探针块每秒刷新 value (实时罐温), stale=false, age<5000ms。

- [ ] **Step 4: 模拟 WS 断 — stale 翻 true**

```bash
pkill -f "tsx watch.*server"
sleep 7
```
浏览器: 探针 stale=true, age 持续涨。

- [ ] **Step 5: 恢复 server, 验 stale 翻回**

```bash
cd /Volumes/SSD/BIOCORE && pnpm --filter @biocore/server dev > /tmp/dod-server2.log 2>&1 &
sleep 12
```
浏览器 (realtime-store 自带重连): 5-10s 内 stale=false, value 重新跳。

- [ ] **Step 6: 还原 dashboard 探针**

```bash
cd /Volumes/SSD/BIOCORE && git checkout -- packages/web-ui/src/app/dashboard/page.tsx
```
(实施 subagent 若改的不是这文件, 用对应路径)

- [ ] **Step 7: 停所有 dev 进程**

```bash
pkill -f "tsx watch.*server" 2>/dev/null
pkill -f "next dev" 2>/dev/null
```

DoD 通过条件:
- 18/18 单测全绿
- 浏览器可见 ~1Hz value 更新
- WS 断 → 5s 内 stale=true
- WS 恢复 → 5-10s 内 stale=false, value 跟新

---

## 自检 (Self-Review)

**1. Spec coverage** (对照 `2026-05-15-scada-tag-subscription-hook-design.md`):
- §1 Tag namespace + 18 字段白名单 → Task 3 (PROCESS_VALUES_FIELDS Set + parseTagId) ✓
- §2 useTag API (TagSnapshot, UseTagOpts) → Task 3 ✓
- §2 useTagHistory API → Task 4 ✓
- §3 数据流 (store selector 模式) → Task 3 + Task 4 ✓
- §3 stale 重判机制 (1Hz tick) → Task 2 (字段) + Task 3 (ensureTick) ✓
- §3 trendBuffer field mapping (5 个 tag) → Task 4 (TREND_FIELD_MAP) ✓
- §4 边界条件表 (10 行) → Task 3 测试 10 用例 + Task 4 测试 6 用例 ✓
- §5 文件结构 → Task 1-5 全部覆盖 ✓
- §6 单测 16 + DoD 6 步 → Task 3-4 测试 + Task 6 ✓
- §9 不做的事 → plan 不超范围 ✓

**2. Placeholder scan**: 无 TBD / TODO / "implement later" / "similar to Task N"。 每 step 含具体代码或具体命令。

**3. Type consistency**:
- `TagSnapshot` 在 Task 3 定义, Task 5 barrel 重导出 ✓
- `TagHistory` / `TagHistoryPoint` 在 Task 4 定义, Task 5 barrel 重导出 ✓
- `parseTagId` / `ParsedTagId` 在 Task 3 export, Task 4 import 使用 ✓
- `useRealtimeStore._tick` 在 Task 2 加, Task 3/4 hook + 测试都依赖 ✓
- 18 个 PROCESS_VALUES_FIELDS 白名单数对应 spec §1 列表 (AI-0..6 = 7, AO-0/1/2_cv = 3, P01..04_rate = 4, rpm + vfd_current + temp_sv + temp_mode = 4 → 18 个) ✓
- TREND_FIELD_MAP 5 项 (AI-0/2/3/5 + rpm) 对应 spec §3 ✓

**4. 执行注意**:
- Task 6 dashboard 探针文件路径不一定 `dashboard/page.tsx` — 实施 subagent grep `app/dashboard` 选具体页面文件
- Task 1 jsdom@^24 若 pnpm 拒装可降 `^22`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-scada-tag-subscription-hook.md`.

用户已在 brainstorming 阶段指示用 **Subagent-Driven (推荐)** 自动执行, 不再确认。直接进入 `superpowers:subagent-driven-development` skill 执行 Task 1-6 + final review。
