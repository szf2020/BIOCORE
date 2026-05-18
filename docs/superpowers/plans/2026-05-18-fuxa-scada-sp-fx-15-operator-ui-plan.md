# SP-FX-15 Operator UI 嵌 Runtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SCADA AI 建议的 accept/reject UI 以可收折浮动 bar 形式嵌入 runtime view-v2，操作员无需离开当前 view 即可处理 pending suggestions。

**Architecture:** 新建 `SuggestionsBar` 组件（含内联 `useSuggestionsBar` hook，5s 轮询），挂载于 `RuntimeShell` 末尾。按 `viewId` 客户端过滤 suggestions；accept/reject 调已有的 `acceptSuggestion`/`rejectSuggestion` API 函数，server dispatcher 负责 PLC write，前端不直接写 PLC。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest + @testing-library/react, Playwright

---

## File Map

| 操作 | 文件 |
|------|------|
| 新建 | `packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx` |
| 新建 | `packages/web-ui/src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx` |
| 修改 | `packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx` |
| 新建 | `packages/web-ui/e2e/scada-operator-ui.spec.ts` |

---

## Task 1: SuggestionsBar — RED tests

**Files:**
- Create: `packages/web-ui/src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `packages/web-ui/src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx`：

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ScadaSuggestion } from '@/api/scada';

vi.mock('@/api/scada', () => ({
  fetchScadaSuggestions: vi.fn(),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
}));

import * as scadaApi from '@/api/scada';
import { SuggestionsBar } from '../SuggestionsBar';

function makeSuggestion(overrides: Partial<ScadaSuggestion> = {}): ScadaSuggestion {
  return {
    id: 1,
    batch_id: 'b1',
    suggestion_type: 'setpoint',
    source_module: 'scada',
    target_param: 'tank_temp',
    current_value: 70,
    suggested_value: 72.5,
    confidence: 0.9,
    reasoning: JSON.stringify({ view_id: 'view-abc', widget_id: 'w1', reason: '温度偏高', value: 72.5 }),
    status: 'pending',
    created_at: '2026-05-18T00:00:00Z',
    expires_at: null,
    decided_by: null,
    decided_at: null,
    ...overrides,
  };
}

describe('SuggestionsBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([]);
    vi.mocked(scadaApi.acceptSuggestion).mockResolvedValue({ success: true });
    vi.mocked(scadaApi.rejectSuggestion).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('T1: showSuggestions=false 时不渲染任何内容', () => {
    const { container } = render(
      <SuggestionsBar viewId="view-abc" reactorId="F01" showSuggestions={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T2: 空状态显示暂无待处理建议', async () => {
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => {
      expect(screen.getByTestId('suggestions-bar-header')).toBeDefined();
    });
    expect(screen.getByText(/暂无待处理建议/)).toBeDefined();
  });

  it('T3: 渲染 pending suggestions 列表', async () => {
    const s = makeSuggestion({ id: 42 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => {
      expect(screen.getByText('tank_temp')).toBeDefined();
    });
    expect(screen.getByText('72.5')).toBeDefined();
  });

  it('T4: 点击接受按钮调用 acceptSuggestion(id)', async () => {
    const s = makeSuggestion({ id: 42 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('accept-42')).toBeDefined());
    fireEvent.click(screen.getByTestId('accept-42'));
    await waitFor(() => {
      expect(scadaApi.acceptSuggestion).toHaveBeenCalledWith(42);
    });
  });

  it('T5: 点击拒绝按钮调用 rejectSuggestion(id)', async () => {
    const s = makeSuggestion({ id: 43 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('reject-43')).toBeDefined());
    fireEvent.click(screen.getByTestId('reject-43'));
    await waitFor(() => {
      expect(scadaApi.rejectSuggestion).toHaveBeenCalledWith(43);
    });
  });

  it('T6: 收折/展开 toggle', async () => {
    const s = makeSuggestion({ id: 1 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('suggestions-bar-header')).toBeDefined());

    expect(screen.getByTestId('suggestions-bar-list')).toBeDefined();

    fireEvent.click(screen.getByTestId('suggestions-bar-toggle'));
    await waitFor(() => {
      expect(screen.queryByTestId('suggestions-bar-list')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('suggestions-bar-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('suggestions-bar-list')).toBeDefined();
    });
  });

  it('T7: viewId 过滤 — 仅显示 view_id 匹配的 suggestion', async () => {
    const match = makeSuggestion({ id: 10, target_param: 'match_param' });
    const noMatch = makeSuggestion({
      id: 11,
      target_param: 'other_param',
      reasoning: JSON.stringify({ view_id: 'other-view', widget_id: 'w2', reason: 'x', value: 1 }),
    });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([match, noMatch]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByText('match_param')).toBeDefined());
    expect(screen.queryByText('other_param')).toBeNull();
  });
});
```

- [ ] **Step 2: 确认测试运行失败**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx 2>&1 | tail -20
```

预期：FAIL — `Cannot find module '../SuggestionsBar'`

- [ ] **Step 3: Commit RED tests**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx
git commit -m "test(sp-fx-15): T1 RED SuggestionsBar vitest"
```

---

## Task 2: SuggestionsBar 实现 (GREEN)

**Files:**
- Create: `packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx`

- [ ] **Step 1: 创建 SuggestionsBar 组件**

新建 `packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx`：

```tsx
'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchScadaSuggestions,
  acceptSuggestion as apiAccept,
  rejectSuggestion as apiReject,
  type ScadaSuggestion,
} from '@/api/scada';

function matchesView(s: ScadaSuggestion, viewId: string): boolean {
  try {
    const meta = JSON.parse(s.reasoning ?? '');
    if (meta && typeof meta === 'object' && 'view_id' in meta) {
      return meta.view_id === viewId;
    }
  } catch {
    /* not JSON — 宽松显示 */
  }
  return true;
}

function useSuggestionsBar(viewId: string, pollIntervalMs = 5000) {
  const [suggestions, setSuggestions] = useState<ScadaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await fetchScadaSuggestions();
      setSuggestions(all.filter((s) => matchesView(s, viewId)));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, [viewId]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, pollIntervalMs);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [load, pollIntervalMs]);

  const accept = useCallback(async (id: number) => {
    await apiAccept(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reject = useCallback(async (id: number) => {
    await apiReject(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { suggestions, loading, error, accept, reject };
}

export interface SuggestionsBarProps {
  viewId: string;
  reactorId: string;
  showSuggestions?: boolean;
}

export function SuggestionsBar({ viewId, reactorId: _reactorId, showSuggestions = true }: SuggestionsBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { suggestions, loading, error, accept, reject } = useSuggestionsBar(viewId);

  if (!showSuggestions) return null;

  const count = suggestions.length;
  const headerLabel = loading
    ? '加载中…'
    : error
      ? `错误: ${error}`
      : `AI 建议 (${count} 条)`;

  return (
    <div
      data-testid="suggestions-bar"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'rgba(255,255,255,0.97)',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        maxHeight: collapsed ? 44 : 320,
        overflow: 'hidden',
        transition: 'max-height 0.2s ease',
      }}
    >
      <div
        data-testid="suggestions-bar-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          height: 44,
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{headerLabel}</span>
        <button
          data-testid="suggestions-bar-toggle"
          type="button"
          onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
          aria-label={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div
          data-testid="suggestions-bar-list"
          style={{ overflowY: 'auto', maxHeight: 276, padding: '0 12px 8px' }}
        >
          {count === 0 && !loading && !error && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 4px' }}>暂无待处理建议</div>
          )}
          {suggestions.map((s) => {
            let reason = s.reasoning ?? '—';
            let value: unknown = s.suggested_value ?? '—';
            try {
              const meta = JSON.parse(s.reasoning ?? '');
              if (meta && typeof meta === 'object') {
                if ('reason' in meta) reason = String(meta.reason ?? '—');
                if ('value' in meta) value = meta.value ?? s.suggested_value ?? '—';
              }
            } catch { /* use raw */ }

            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 4px',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 13,
                }}
              >
                <span style={{ color: '#6b7280', minWidth: 28 }}>#{s.id}</span>
                <span style={{ fontFamily: 'monospace', minWidth: 120, fontWeight: 500 }}>{s.target_param}</span>
                <span style={{ color: '#1d4ed8', minWidth: 48 }}>{String(value)}</span>
                <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</span>
                <button
                  data-testid={`reject-${s.id}`}
                  type="button"
                  onClick={() => reject(s.id)}
                  style={{ padding: '2px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: '#fff', fontSize: 12 }}
                >
                  拒绝
                </button>
                <button
                  data-testid={`accept-${s.id}`}
                  type="button"
                  onClick={() => accept(s.id)}
                  style={{ padding: '2px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#2563eb', color: '#fff', fontSize: 12 }}
                >
                  接受
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 运行测试 — 应全绿**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/components/scada/runtime/__tests__/SuggestionsBar.test.tsx 2>&1 | tail -30
```

预期：7 tests pass

- [ ] **Step 3: 运行全量 vitest**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run 2>&1 | tail -10
```

预期：≥ 1014 tests pass，0 fail

- [ ] **Step 4: Commit GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx
git commit -m "feat(sp-fx-15): T2 SuggestionsBar component + useSuggestionsBar hook"
```

---

## Task 3: RuntimeShell 嵌入 SuggestionsBar

**Files:**
- Modify: `packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx`
- Modify: `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx`

- [ ] **Step 1: 更新 RuntimeShell**

将 `packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx` 完整替换为：

```tsx
'use client';
import React from 'react';
import type { JSX } from 'react';
import { RuntimeCanvas } from './RuntimeCanvas';
import { SuggestionsBar } from '@/components/scada/runtime/SuggestionsBar';
import type { FuxaView } from '../models';

export interface RuntimeShellProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
  showSuggestions?: boolean;
}

export function RuntimeShell({ view, viewId, reactorId, showSuggestions = true }: RuntimeShellProps): JSX.Element {
  return (
    <div className="relative w-screen h-screen bg-zinc-100">
      <RuntimeCanvas view={view} viewId={viewId} reactorId={reactorId} />
      <SuggestionsBar viewId={viewId} reactorId={reactorId} showSuggestions={showSuggestions} />
    </div>
  );
}
```

- [ ] **Step 2: 更新 RuntimeShell 测试**

将 `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx` 完整替换为：

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RuntimeShell } from '../RuntimeShell';

vi.mock('../RuntimeCanvas', () => ({
  RuntimeCanvas: ({ viewId }: { viewId: string }) => (
    <div data-testid={`canvas-${viewId}`} />
  ),
}));

vi.mock('@/components/scada/runtime/SuggestionsBar', () => ({
  SuggestionsBar: ({ viewId, showSuggestions }: { viewId: string; showSuggestions?: boolean }) =>
    showSuggestions !== false ? <div data-testid={`suggestions-bar-${viewId}`} /> : null,
}));

describe('RuntimeShell', () => {
  it('renders RuntimeCanvas inside relative full-screen wrapper', () => {
    const view = {
      id: 'v1', name: 'Test', svgcontent: '<svg/>',
      width: 800, height: 600, items: {},
    } as any;
    const { container, getByTestId } = render(
      <RuntimeShell view={view} viewId="v1" reactorId="F01" />,
    );
    expect(getByTestId('canvas-v1')).toBeDefined();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('w-screen');
    expect(wrapper.className).toContain('h-screen');
    expect(wrapper.className).toContain('relative');
  });

  it('renders SuggestionsBar by default', () => {
    const view = { id: 'v2', name: 'T', svgcontent: '<svg/>', width: 800, height: 600, items: {} } as any;
    const { getByTestId } = render(
      <RuntimeShell view={view} viewId="v2" reactorId="F01" />,
    );
    expect(getByTestId('suggestions-bar-v2')).toBeDefined();
  });

  it('hides SuggestionsBar when showSuggestions=false', () => {
    const view = { id: 'v3', name: 'T', svgcontent: '<svg/>', width: 800, height: 600, items: {} } as any;
    const { queryByTestId } = render(
      <RuntimeShell view={view} viewId="v3" reactorId="F01" showSuggestions={false} />,
    );
    expect(queryByTestId('suggestions-bar-v3')).toBeNull();
  });
});
```

- [ ] **Step 3: 运行 RuntimeShell 测试**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx 2>&1 | tail -20
```

预期：3 tests pass

- [ ] **Step 4: 运行全量 vitest**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run 2>&1 | tail -10
```

预期：≥ 1021 pass（+7 SuggestionsBar +2 RuntimeShell 新增），0 fail

- [ ] **Step 5: tsc 类型检查**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -30
```

预期：0 errors

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx
git add packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx
git commit -m "feat(sp-fx-15): T3 RuntimeShell embed SuggestionsBar"
```

---

## Task 4: Playwright E2E

**Files:**
- Create: `packages/web-ui/e2e/scada-operator-ui.spec.ts`

- [ ] **Step 1: 创建 E2E spec**

新建 `packages/web-ui/e2e/scada-operator-ui.spec.ts`：

```typescript
// SP-FX-15: Operator UI 嵌 runtime — SuggestionsBar E2E
import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function ensureProject(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${API_BASE}/api/v1/scada/projects`, {
    data: { project_id: 'default', name: 'Default' },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedView(request: APIRequestContext, token: string): Promise<string> {
  const viewId = `v_opui_${Date.now()}`;
  const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
    data: { view_id: viewId, name: `OperatorUI E2E ${Date.now()}` },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

async function seedSuggestion(
  request: APIRequestContext,
  token: string,
  viewId: string,
): Promise<number> {
  const r = await request.post(`${API_BASE}/api/v1/scada/write-intents`, {
    data: {
      tag: 'e2e_tag',
      value: 42,
      reason: 'E2E operator-ui test',
      view_id: viewId,
      widget_id: 'w_e2e',
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) return -1;
  const body = await r.json();
  return body.suggestion_id ?? body.data?.suggestion_id ?? -1;
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  const isLoggedIn = await page
    .locator('[data-testid="user-menu"]')
    .isVisible()
    .catch(() => false);
  if (!isLoggedIn) {
    await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
    await page.locator('input[type="password"]').fill(ADMIN_PASS);
    await page.getByRole('button', { name: /登录|sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
  }
}

test.describe('SP-FX-15: Operator UI — SuggestionsBar in runtime', () => {
  let token: string;
  let viewId: string;
  let suggestionId: number;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureProject(request, token);
    viewId = await seedView(request, token);
    suggestionId = await seedSuggestion(request, token, viewId);
  });

  test('SuggestionsBar visible → accept → suggestion removed', async ({ page }) => {
    if (suggestionId === -1) {
      test.skip(true, 'suggestion seed skipped — server may not support write-intents');
      return;
    }

    // Stub accept endpoint
    await page.route(`**/api/v1/ai/suggestions/${suggestionId}/accept`, (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) }),
    );

    // Stub suggestions list: first call returns our suggestion, subsequent calls return []
    let callCount = 0;
    await page.route('**/api/v1/ai/suggestions*', (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: suggestionId,
              batch_id: 'b_e2e',
              suggestion_type: 'setpoint',
              source_module: 'scada',
              target_param: 'e2e_tag',
              current_value: null,
              suggested_value: 42,
              confidence: 0.9,
              reasoning: JSON.stringify({ view_id: viewId, widget_id: 'w_e2e', reason: 'E2E operator-ui test', value: 42 }),
              status: 'pending',
              created_at: new Date().toISOString(),
              expires_at: null,
              decided_by: null,
              decided_at: null,
            },
          ]),
        });
      } else {
        route.fulfill({ status: 200, body: JSON.stringify([]) });
      }
    });

    await login(page);
    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);

    // SuggestionsBar container visible
    await expect(page.getByTestId('suggestions-bar')).toBeVisible({ timeout: 15_000 });

    // e2e_tag visible in bar
    await expect(page.locator('text=e2e_tag')).toBeVisible({ timeout: 8_000 });

    // Click accept
    const acceptBtn = page.getByTestId(`accept-${suggestionId}`);
    await expect(acceptBtn).toBeVisible({ timeout: 5_000 });
    await acceptBtn.click();

    // Suggestion removed from list (乐观 remove)
    await expect(page.locator('text=e2e_tag')).not.toBeVisible({ timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Commit E2E spec**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-operator-ui.spec.ts
git commit -m "test(sp-fx-15): T4 E2E scada-operator-ui spec"
```

---

## Task 5: 全量验证 + Push

- [ ] **Step 1: 全量 vitest**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run 2>&1 | tail -15
```

预期：≥ 1021 pass，0 fail

- [ ] **Step 2: tsc 全量**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -20
```

预期：0 errors

- [ ] **Step 3: git pull --rebase 然后 push**

```bash
cd /Volumes/SSD/projects/BIOCore
git pull --rebase origin main
git push origin main
```

预期：push 成功，no conflicts

- [ ] **Step 4: 报告结果**

```bash
cd /Volumes/SSD/projects/BIOCore
git log --oneline -8
```

记录各 commit SHA、最终 vitest 总数、PW pass/skip 状态。
