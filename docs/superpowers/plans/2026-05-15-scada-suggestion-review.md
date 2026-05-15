# SCADA Suggestion Review UI + WS Toast 实施计划 (子项目 6/7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SCADA 来源 (`source_module='scada'`) 的 write-intent suggestion 建立专用审核 UI + 实时 WS Toast,操作员复用现有 accept/reject REST。PLC 实际下发延后至子项目 7。

**Architecture:** 服务端新增 `getPendingSuggestionsBySource` + GET `/ai/suggestions` 加 `source_module` 过滤;`scada-routes` broadcast 加显示字段。客户端新增 `/scada/layout.tsx`(挂载全局 toast) + `/scada/suggestions/page.tsx`(队列) + `useScadaSuggestions` hook(store 订阅 + 500ms debounce refetch) + `ScadaToast`(5s 自动消失,STACK_MAX=3,seenIdsRef 去重)。

**Tech Stack:** TypeScript / Next.js 14 App Router / React 18 / Zustand / vitest 1.6 + @testing-library/react 14 + jsdom / supertest + better-sqlite3。

**Spec:** `docs/superpowers/specs/2026-05-15-scada-suggestion-review-design.md`

**Branch:** `feat/scada-data-model`

---

## 文件清单

**新建:**
- `packages/web-ui/src/hooks/useScadaSuggestions.ts`
- `packages/web-ui/src/hooks/__tests__/useScadaSuggestions.test.ts`
- `packages/web-ui/src/components/scada/suggestions/SuggestionList.tsx`
- `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx`
- `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionList.test.tsx`
- `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.test.tsx`
- `packages/web-ui/src/components/scada/suggestions/ScadaToast.tsx`
- `packages/web-ui/src/components/scada/suggestions/__tests__/ScadaToast.test.tsx`
- `packages/web-ui/src/app/scada/layout.tsx`
- `packages/web-ui/src/app/scada/suggestions/page.tsx`
- `packages/web-ui/src/stores/__tests__/realtime-scada-source.test.ts`
- `packages/server/src/__tests__/ai-suggestions-source-filter.test.ts`

**修改:**
- `packages/data-service/src/sqlite-service.ts` — 加 `getPendingSuggestionsBySource`
- `packages/server/src/index.ts` — GET `/ai/suggestions` 加 source_module 过滤
- `packages/server/src/scada-routes.ts` — broadcast payload 加 source_module/target_param/suggested_value
- `packages/server/src/ai-suggestion-engine.ts` — broadcast payload 加 source_module (defensive)
- `packages/web-ui/src/api/scada.ts` — 加 ScadaSuggestion 类型 + 三个 API 函数
- `packages/web-ui/src/stores/realtime-store.ts` — AiSuggestion interface 加 source_module/target_param/suggested_value/action 字段
- `packages/web-ui/src/app/scada/page.tsx` — header 加 "审核队列" 链接

---

## Task 1: data-service — `getPendingSuggestionsBySource`

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts` (插入现有 `getPendingSuggestions` 之后)

- [ ] **Step 1: 定位现有 `getPendingSuggestions` 方法**

读 `packages/data-service/src/sqlite-service.ts`,找到 `getPendingSuggestions` 方法(约 line 285)。

- [ ] **Step 2: 在其后追加新方法**

```ts
getPendingSuggestionsBySource(batchId?: string, sourceModule?: string): any[] {
  const clauses: string[] = ["status = 'pending'"];
  const params: any[] = [];
  if (batchId) { clauses.push('batch_id = ?'); params.push(batchId); }
  if (sourceModule) { clauses.push('source_module = ?'); params.push(sourceModule); }
  const sql = `SELECT * FROM ai_suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 100`;
  return this.db.prepare(sql).all(...params);
}
```

- [ ] **Step 3: 编译验证**

Run: `cd packages/data-service && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 提交**

```bash
git add packages/data-service/src/sqlite-service.ts
git commit -m "feat(data-service): getPendingSuggestionsBySource(batchId?, sourceModule?)"
```

---

## Task 2: server — GET `/ai/suggestions` 加 `source_module` 过滤 + 2 测试

**Files:**
- Modify: `packages/server/src/index.ts` (~line 2819, `apiRouter.get('/ai/suggestions', ...)` 块)
- Create: `packages/server/src/__tests__/ai-suggestions-source-filter.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/server/src/__tests__/ai-suggestions-source-filter.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import express from 'express';
import { SqliteService } from '@biocore/data-service';
import { createApiRouter } from '../index'; // 若无 export, 使用集成式 server 启动

let app: express.Express;
let svc: SqliteService;

beforeAll(() => {
  const db = new Database(':memory:');
  svc = new SqliteService(db);
  svc.runMigrations();
  // seed batches FK
  db.prepare(`INSERT INTO batches (batch_id, recipe_id, started_at, current_state)
              VALUES ('b1', 1, datetime('now'), 'running')`).run();
  // seed 1 scada + 1 ai_auto pending
  svc.createSuggestion({
    batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
    target_param: 'F01.SP-temp', suggested_value: 38, reasoning: 'test',
  });
  svc.createSuggestion({
    batch_id: 'b1', suggestion_type: 'setpoint_adjust', source_module: 'ai_auto',
    target_param: 'F01.SP-pH', suggested_value: 7.2, reasoning: 'auto',
  });
  app = express();
  app.use(express.json());
  // mount minimal route for test isolation:
  app.get('/ai/suggestions', (req, res) => {
    const status = (req.query.status as string) || 'pending';
    const batchId = req.query.batch_id as string | undefined;
    const source = req.query.source_module as string | undefined;
    if (status === 'pending') {
      svc.expirePendingSuggestions(batchId || '');
      return res.json(svc.getPendingSuggestionsBySource(batchId, source));
    }
    const clauses: string[] = ['status = ?'];
    const params: any[] = [status];
    if (batchId) { clauses.push('batch_id = ?'); params.push(batchId); }
    if (source) { clauses.push('source_module = ?'); params.push(source); }
    const sql = `SELECT * FROM ai_suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;
    return res.json(svc.getDatabase().prepare(sql).all(...params));
  });
});

describe('GET /ai/suggestions source_module filter', () => {
  it('returns only scada rows when source_module=scada', async () => {
    const r = await request(app).get('/ai/suggestions?status=pending&source_module=scada');
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body[0].source_module).toBe('scada');
    expect(r.body[0].target_param).toBe('F01.SP-temp');
  });

  it('returns all pending when source_module omitted (backward compat)', async () => {
    const r = await request(app).get('/ai/suggestions?status=pending');
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试看 RED**

Run: `cd packages/server && npx vitest run src/__tests__/ai-suggestions-source-filter.test.ts`
Expected: FAIL (handler 不识别 source_module 或 SqliteService 缺方法)

- [ ] **Step 3: 修改 server index.ts handler**

打开 `packages/server/src/index.ts`,搜索 `apiRouter.get('/ai/suggestions'`(约 line 2819),改为:

```ts
apiRouter.get('/ai/suggestions', (req, res) => {
  const status = (req.query.status as string) || 'pending';
  const batchId = req.query.batch_id as string | undefined;
  const source = req.query.source_module as string | undefined;
  if (status === 'pending') {
    sqlite.expirePendingSuggestions(batchId || '');
    return res.json(sqlite.getPendingSuggestionsBySource(batchId, source));
  }
  const clauses: string[] = ['status = ?'];
  const params: any[] = [status];
  if (batchId) { clauses.push('batch_id = ?'); params.push(batchId); }
  if (source) { clauses.push('source_module = ?'); params.push(source); }
  const sql = `SELECT * FROM ai_suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;
  return res.json(sqlite.getDatabase().prepare(sql).all(...params));
});
```

- [ ] **Step 4: 运行测试看 GREEN**

Run: `cd packages/server && npx vitest run src/__tests__/ai-suggestions-source-filter.test.ts`
Expected: PASS 2/2

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/index.ts packages/server/src/__tests__/ai-suggestions-source-filter.test.ts
git commit -m "feat(server): GET /ai/suggestions source_module filter + 2 tests"
```

---

## Task 3: server — broadcast payload 加 source_module/target_param/suggested_value

**Files:**
- Modify: `packages/server/src/scada-routes.ts` (~line 302)
- Modify: `packages/server/src/ai-suggestion-engine.ts` (~line 188)

- [ ] **Step 1: 修改 scada-routes.ts broadcast**

打开 `packages/server/src/scada-routes.ts`,搜索 `broadcast('ai_suggestion'`(POST /write-intents handler 内,~line 302)。

旧:
```ts
broadcast('ai_suggestion', { id: suggestion_id, action: 'created', source: 'scada' });
```

改为:
```ts
broadcast('ai_suggestion', {
  id: suggestion_id,
  action: 'created',
  source: 'scada',
  source_module: 'scada',
  target_param: tag,
  suggested_value: typeof value === 'number' ? value : null,
});
```

(`tag` 与 `value` 在同 handler 已 destructure 自 `req.body`,无需新变量)

- [ ] **Step 2: 修改 ai-suggestion-engine.ts broadcast (defensive)**

打开 `packages/server/src/ai-suggestion-engine.ts`,搜索 `broadcast('ai_suggestion'`(~line 188)。

旧:
```ts
broadcast('ai_suggestion', { id: row.id, action: 'created', source: 'ai_auto' });
```

(可能字段不同,按当前实际改;若已含 source_module 字段则跳过)。

改为:
```ts
broadcast('ai_suggestion', {
  id: row.id,
  action: 'created',
  source: 'ai_auto',
  source_module: row.source_module || 'ai_auto',
  target_param: row.target_param,
  suggested_value: row.suggested_value,
});
```

- [ ] **Step 3: 跑已有相关测试**

Run: `cd packages/server && npx vitest run src/__tests__/scada-routes.test.ts`
Expected: 既有 16/16 通过 (broadcast 字段添加不破坏现有断言)

- [ ] **Step 4: 提交**

```bash
git add packages/server/src/scada-routes.ts packages/server/src/ai-suggestion-engine.ts
git commit -m "feat(server): ai_suggestion broadcast carries source_module/target_param/suggested_value for toast"
```

---

## Task 4: realtime-store — AiSuggestion interface 扩展 + 1 测试

**Files:**
- Modify: `packages/web-ui/src/stores/realtime-store.ts` (~line 28 interface)
- Create: `packages/web-ui/src/stores/__tests__/realtime-scada-source.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/web-ui/src/stores/__tests__/realtime-scada-source.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeStore } from '../realtime-store';

describe('realtime-store AiSuggestion source_module', () => {
  beforeEach(() => {
    useRealtimeStore.setState({ aiSuggestions: [] } as any);
  });

  it('stores scada-source ai_suggestion with display fields', () => {
    const { handleMessage } = useRealtimeStore.getState() as any;
    handleMessage({
      channel: 'ai_suggestion',
      data: {
        id: 42,
        action: 'created',
        source: 'scada',
        source_module: 'scada',
        target_param: 'F01.SP-temp',
        suggested_value: 38,
      },
    });
    const list = useRealtimeStore.getState().aiSuggestions;
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(42);
    expect(list[0].source_module).toBe('scada');
    expect(list[0].target_param).toBe('F01.SP-temp');
    expect(list[0].suggested_value).toBe(38);
  });
});
```

- [ ] **Step 2: 运行测试看 RED**

Run: `cd packages/web-ui && npx vitest run src/stores/__tests__/realtime-scada-source.test.ts`
Expected: FAIL (interface 不含 source_module/target_param 等字段, TS 报错或 undefined)

- [ ] **Step 3: 扩展 interface**

打开 `packages/web-ui/src/stores/realtime-store.ts`,找到 `interface AiSuggestion`(约 line 28)。加可选字段:

```ts
interface AiSuggestion {
  id: number | string;
  type?: string;
  message?: string;
  parameter?: string;
  current_value?: number;
  suggested_value?: number | null;
  confidence?: number;
  timestamp?: string;
  source_module?: string;
  target_param?: string;
  action?: string;
  batch_id?: string;
}
```

(若现有字段名不同,保留现有 + 加上述新字段)

确认 `case 'ai_suggestion'` 的 dispatch 把整个 payload spread 入 store(已存在,不改)。

- [ ] **Step 4: 运行测试看 GREEN**

Run: `cd packages/web-ui && npx vitest run src/stores/__tests__/realtime-scada-source.test.ts`
Expected: PASS 1/1

- [ ] **Step 5: 提交**

```bash
git add packages/web-ui/src/stores/realtime-store.ts packages/web-ui/src/stores/__tests__/realtime-scada-source.test.ts
git commit -m "feat(web-ui): AiSuggestion interface — source_module/target_param/suggested_value/action"
```

---

## Task 5: api/scada.ts — 加 ScadaSuggestion 类型 + 三个 API 函数

**Files:**
- Modify: `packages/web-ui/src/api/scada.ts` (追加)

- [ ] **Step 1: 追加到 api/scada.ts 末尾**

```ts
export interface ScadaSuggestion {
  id: number;
  batch_id: string;
  suggestion_type: string;
  source_module: string;
  target_param: string;
  current_value: number | null;
  suggested_value: number | null;
  confidence: number | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export async function fetchScadaSuggestions(): Promise<ScadaSuggestion[]> {
  const r = await fetch(`${API}/api/v1/ai/suggestions?status=pending&source_module=scada`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetchScadaSuggestions ${r.status}`);
  return r.json();
}

export async function acceptSuggestion(id: number): Promise<{ success: boolean }> {
  const r = await fetch(`${API}/api/v1/ai/suggestions/${id}/accept`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `acceptSuggestion ${r.status}`);
  }
  return r.json();
}

export async function rejectSuggestion(id: number): Promise<{ success: boolean }> {
  const r = await fetch(`${API}/api/v1/ai/suggestions/${id}/reject`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `rejectSuggestion ${r.status}`);
  }
  return r.json();
}
```

(确认 `API` const 和 `authHeaders()` helper 已在文件顶部存在;sub-project 4 已添加)

- [ ] **Step 2: TS 编译**

Run: `cd packages/web-ui && npx tsc --noEmit`
Expected: 0 new errors

- [ ] **Step 3: 提交**

```bash
git add packages/web-ui/src/api/scada.ts
git commit -m "feat(web-ui): api/scada — ScadaSuggestion + fetchScadaSuggestions/accept/reject"
```

---

## Task 6: useScadaSuggestions hook + 4 测试

**Files:**
- Create: `packages/web-ui/src/hooks/useScadaSuggestions.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useScadaSuggestions.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/web-ui/src/hooks/__tests__/useScadaSuggestions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useScadaSuggestions } from '../useScadaSuggestions';
import * as api from '@/api/scada';

beforeEach(() => {
  useRealtimeStore.setState({ aiSuggestions: [] } as any);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useScadaSuggestions', () => {
  it('fetches on mount via fetchScadaSuggestions', async () => {
    const spy = vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([
      { id: 1, batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
        target_param: 'F01.SP-temp', current_value: null, suggested_value: 38,
        confidence: null, reasoning: '{}', status: 'pending',
        created_at: '2026-05-15T00:00:00Z', expires_at: null,
        decided_by: null, decided_at: null },
    ] as any);
    const { result } = renderHook(() => useScadaSuggestions());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));
  });

  it('accept(id) POSTs and removes from list', async () => {
    vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([
      { id: 1 } as any, { id: 2 } as any,
    ]);
    const acceptSpy = vi.spyOn(api, 'acceptSuggestion').mockResolvedValue({ success: true });
    const { result } = renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(result.current.suggestions.length).toBe(2));
    await act(async () => { await result.current.accept(1); });
    expect(acceptSpy).toHaveBeenCalledWith(1);
    expect(result.current.suggestions.map((s) => s.id)).toEqual([2]);
  });

  it('reject(id) POSTs and removes from list', async () => {
    vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([{ id: 7 } as any]);
    const rejectSpy = vi.spyOn(api, 'rejectSuggestion').mockResolvedValue({ success: true });
    const { result } = renderHook(() => useScadaSuggestions());
    await waitFor(() => expect(result.current.suggestions.length).toBe(1));
    await act(async () => { await result.current.reject(7); });
    expect(rejectSpy).toHaveBeenCalledWith(7);
    expect(result.current.suggestions.length).toBe(0);
  });

  it('store aiSuggestions head update → debounced refetch after 500ms', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchScadaSuggestions').mockResolvedValue([]);
    renderHook(() => useScadaSuggestions());
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [
          { id: 99, source_module: 'scada', target_param: 'F01.SP-temp', suggested_value: 42 } as any,
        ],
      } as any);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // not yet
    await act(async () => { vi.advanceTimersByTime(500); });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: 运行测试看 RED**

Run: `cd packages/web-ui && npx vitest run src/hooks/__tests__/useScadaSuggestions.test.ts`
Expected: FAIL (hook 不存在)

- [ ] **Step 3: 实现 hook**

创建 `packages/web-ui/src/hooks/useScadaSuggestions.ts`:

```ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import {
  fetchScadaSuggestions,
  acceptSuggestion as apiAccept,
  rejectSuggestion as apiReject,
  type ScadaSuggestion,
} from '@/api/scada';

const REFETCH_DEBOUNCE_MS = 500;

export function useScadaSuggestions() {
  const [suggestions, setSuggestions] = useState<ScadaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchScadaSuggestions();
      setSuggestions(list);
    } catch (e: any) {
      setError(e?.message || 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!latest) return;
    const src = (latest as any).source_module;
    if (src !== 'scada') return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(refetch, REFETCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [latest?.id, refetch]);

  const accept = useCallback(async (id: number) => {
    await apiAccept(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reject = useCallback(async (id: number) => {
    await apiReject(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { suggestions, loading, error, refetch, accept, reject };
}
```

- [ ] **Step 4: 运行测试看 GREEN**

Run: `cd packages/web-ui && npx vitest run src/hooks/__tests__/useScadaSuggestions.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: 提交**

```bash
git add packages/web-ui/src/hooks/useScadaSuggestions.ts packages/web-ui/src/hooks/__tests__/useScadaSuggestions.test.ts
git commit -m "feat(web-ui): useScadaSuggestions hook — store-driven debounced refetch + accept/reject (4 tests)"
```

---

## Task 7: SuggestionRow + SuggestionList + 5 测试

**Files:**
- Create: `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx`
- Create: `packages/web-ui/src/components/scada/suggestions/SuggestionList.tsx`
- Create: `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.test.tsx`
- Create: `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionList.test.tsx`

- [ ] **Step 1: 写 SuggestionRow 测试**

创建 `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionRow } from '../SuggestionRow';

const baseSuggestion: any = {
  id: 7,
  batch_id: 'b1',
  suggestion_type: 'widget_button',
  source_module: 'scada',
  target_param: 'F01.SP-temp',
  current_value: null,
  suggested_value: 38,
  confidence: null,
  reasoning: JSON.stringify({ reason: '测试 reason', view_id: 'demo_v1', widget_id: 'btn-1', value: 38 }),
  status: 'pending',
  created_at: '2026-05-15T00:00:00Z',
  expires_at: null,
  decided_by: null,
  decided_at: null,
};

describe('SuggestionRow', () => {
  it('renders target_param + suggested_value + reasoning JSON meta + widget link', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<SuggestionRow suggestion={baseSuggestion} onAccept={onAccept} onReject={onReject} />);
    expect(screen.getByText('F01.SP-temp')).toBeTruthy();
    expect(screen.getByText('38')).toBeTruthy();
    expect(screen.getByText(/测试 reason/)).toBeTruthy();
    const link = screen.getByText('demo_v1') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/scada/demo_v1');
    expect(screen.getByText(/btn-1/)).toBeTruthy();

    fireEvent.click(screen.getByText('接受'));
    expect(onAccept).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByText('拒绝'));
    expect(onReject).toHaveBeenCalledWith(7);
  });

  it('falls back to raw reasoning when reasoning is non-JSON', () => {
    render(
      <SuggestionRow
        suggestion={{ ...baseSuggestion, reasoning: '原始文本说明' }}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );
    expect(screen.getByText(/原始文本说明/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 写 SuggestionList 测试**

创建 `packages/web-ui/src/components/scada/suggestions/__tests__/SuggestionList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionList } from '../SuggestionList';

describe('SuggestionList', () => {
  it('shows empty state when no suggestions', () => {
    render(<SuggestionList suggestions={[]} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/暂无待处理 SCADA 建议/)).toBeTruthy();
  });

  it('renders N rows', () => {
    const list: any[] = [
      { id: 1, target_param: 'A', suggested_value: 1, reasoning: '{}' },
      { id: 2, target_param: 'B', suggested_value: 2, reasoning: '{}' },
      { id: 3, target_param: 'C', suggested_value: 3, reasoning: '{}' },
    ];
    render(<SuggestionList suggestions={list} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('propagates accept callback', () => {
    const onAccept = vi.fn();
    const list: any[] = [{ id: 9, target_param: 'X', suggested_value: 1, reasoning: '{}' }];
    render(<SuggestionList suggestions={list} onAccept={onAccept} onReject={() => {}} />);
    fireEvent.click(screen.getByText('接受'));
    expect(onAccept).toHaveBeenCalledWith(9);
  });
});
```

- [ ] **Step 3: 看 RED**

Run: `cd packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/`
Expected: FAIL (组件不存在)

- [ ] **Step 4: 实现 SuggestionRow**

创建 `packages/web-ui/src/components/scada/suggestions/SuggestionRow.tsx`:

```tsx
'use client';
import React from 'react';
import type { ScadaSuggestion } from '@/api/scada';

interface Props {
  suggestion: ScadaSuggestion;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export function SuggestionRow({ suggestion, onAccept, onReject }: Props) {
  let meta: { reason?: string; view_id?: string; widget_id?: string; value?: any } = {};
  try {
    if (suggestion.reasoning) meta = JSON.parse(suggestion.reasoning);
  } catch { /* fallback to raw reasoning */ }

  const isJson = meta && Object.keys(meta).length > 0;
  const valueDisplay = suggestion.suggested_value ?? (meta.value ?? '—');
  const reasonDisplay = isJson ? (meta.reason ?? '—') : (suggestion.reasoning ?? '—');

  return (
    <div className="border rounded p-3 bg-white space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-sm">{suggestion.target_param}</div>
        <span className="text-xs text-gray-400">#{suggestion.id} · {suggestion.created_at}</span>
      </div>
      <div className="text-sm">
        <span className="text-gray-500">建议值: </span>
        <span className="font-mono">{String(valueDisplay)}</span>
      </div>
      <div className="text-xs text-gray-600">
        理由: {reasonDisplay}
      </div>
      {meta.view_id && (
        <div className="text-xs text-gray-500">
          来源:{' '}
          <a href={`/scada/${meta.view_id}`} className="text-blue-600 hover:underline">{meta.view_id}</a>
          {meta.widget_id && <> · widget <span className="font-mono">{meta.widget_id}</span></>}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onReject(suggestion.id)}
          className="px-3 py-1 border rounded text-xs text-gray-700"
        >
          拒绝
        </button>
        <button
          type="button"
          onClick={() => onAccept(suggestion.id)}
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
        >
          接受
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 实现 SuggestionList**

创建 `packages/web-ui/src/components/scada/suggestions/SuggestionList.tsx`:

```tsx
'use client';
import React from 'react';
import type { ScadaSuggestion } from '@/api/scada';
import { SuggestionRow } from './SuggestionRow';

interface Props {
  suggestions: ScadaSuggestion[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export function SuggestionList({ suggestions, onAccept, onReject }: Props) {
  if (suggestions.length === 0) {
    return <div className="p-6 text-center text-gray-400 text-sm">暂无待处理 SCADA 建议</div>;
  }
  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <SuggestionRow key={s.id} suggestion={s} onAccept={onAccept} onReject={onReject} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: 看 GREEN**

Run: `cd packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/`
Expected: PASS 5/5

- [ ] **Step 7: 提交**

```bash
git add packages/web-ui/src/components/scada/suggestions/
git commit -m "feat(web-ui): SuggestionList + SuggestionRow — JSON reasoning fallback (5 tests)"
```

---

## Task 8: ScadaToast + 3 测试

**Files:**
- Create: `packages/web-ui/src/components/scada/suggestions/ScadaToast.tsx`
- Create: `packages/web-ui/src/components/scada/suggestions/__tests__/ScadaToast.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `packages/web-ui/src/components/scada/suggestions/__tests__/ScadaToast.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { ScadaToast } from '../ScadaToast';

beforeEach(() => {
  useRealtimeStore.setState({ aiSuggestions: [] } as any);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ScadaToast', () => {
  it('shows toast when scada-source suggestion arrives', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 1, source_module: 'scada', target_param: 'F01.SP-temp', suggested_value: 38 } as any],
      } as any);
    });
    expect(screen.getByText(/F01.SP-temp = 38/)).toBeTruthy();
    expect(screen.getByText(/SCADA 建议 #1/)).toBeTruthy();
  });

  it('does NOT show toast for non-scada source', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 5, source_module: 'ai_auto', target_param: 'F01.SP-pH', suggested_value: 7.2 } as any],
      } as any);
    });
    expect(screen.queryByText(/SCADA 建议 #5/)).toBeNull();
  });

  it('auto-dismisses after 5 seconds', () => {
    render(<ScadaToast />);
    act(() => {
      useRealtimeStore.setState({
        aiSuggestions: [{ id: 2, source_module: 'scada', target_param: 'X', suggested_value: 1 } as any],
      } as any);
    });
    expect(screen.getByText(/SCADA 建议 #2/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText(/SCADA 建议 #2/)).toBeNull();
  });
});
```

- [ ] **Step 2: 看 RED**

Run: `cd packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/ScadaToast.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 ScadaToast**

创建 `packages/web-ui/src/components/scada/suggestions/ScadaToast.tsx`:

```tsx
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

const TOAST_TTL_MS = 5000;
const STACK_MAX = 3;

interface ToastItem { id: number; suggestionId: number | string; msg: string; }

export function ScadaToast() {
  const [stack, setStack] = useState<ToastItem[]>([]);
  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);
  const seenIdsRef = useRef<Set<number | string>>(new Set());

  useEffect(() => {
    if (!latest) return;
    const src = (latest as any).source_module;
    if (src !== 'scada') return;
    if (seenIdsRef.current.has(latest.id)) return;
    seenIdsRef.current.add(latest.id);

    const item: ToastItem = {
      id: Date.now() + Math.random(),
      suggestionId: latest.id,
      msg: `新写意图: ${(latest as any).target_param ?? '—'} = ${(latest as any).suggested_value ?? '—'}`,
    };
    setStack((s) => [item, ...s].slice(0, STACK_MAX));
    const timer = setTimeout(() => {
      setStack((s) => s.filter((x) => x.id !== item.id));
    }, TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [latest?.id]);

  if (stack.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stack.map((t) => (
        <div key={t.id} className="bg-white border-l-4 border-yellow-500 shadow-lg p-3 rounded text-sm" style={{ minWidth: 280 }}>
          <div className="text-xs text-yellow-700 font-semibold mb-1">SCADA 建议 #{t.suggestionId}</div>
          <div className="text-gray-700">{t.msg}</div>
          <div className="text-right mt-1">
            <a href="/scada/suggestions" className="text-xs text-blue-600 hover:underline">查看</a>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 看 GREEN**

Run: `cd packages/web-ui && npx vitest run src/components/scada/suggestions/__tests__/ScadaToast.test.tsx`
Expected: PASS 3/3

- [ ] **Step 5: 提交**

```bash
git add packages/web-ui/src/components/scada/suggestions/ScadaToast.tsx packages/web-ui/src/components/scada/suggestions/__tests__/ScadaToast.test.tsx
git commit -m "feat(web-ui): ScadaToast — 5s auto-dismiss, STACK_MAX=3, source_module=scada filter (3 tests)"
```

---

## Task 9: layout.tsx + suggestions/page.tsx + index 链接

**Files:**
- Create: `packages/web-ui/src/app/scada/layout.tsx`
- Create: `packages/web-ui/src/app/scada/suggestions/page.tsx`
- Modify: `packages/web-ui/src/app/scada/page.tsx`

- [ ] **Step 1: 创建 layout.tsx**

```tsx
'use client';
import React from 'react';
import { ScadaToast } from '@/components/scada/suggestions/ScadaToast';

export default function ScadaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScadaToast />
    </>
  );
}
```

- [ ] **Step 2: 创建 suggestions/page.tsx**

```tsx
'use client';
import React from 'react';
import Link from 'next/link';
import { useScadaSuggestions } from '@/hooks/useScadaSuggestions';
import { SuggestionList } from '@/components/scada/suggestions/SuggestionList';

export default function ScadaSuggestionsPage() {
  const { suggestions, loading, error, refetch, accept, reject } = useScadaSuggestions();

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SCADA 写意图审核</h1>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={refetch} className="text-blue-600 hover:underline">刷新</button>
          <Link href="/scada" className="text-blue-600 hover:underline">← SCADA 列表</Link>
        </div>
      </div>
      <div className="text-sm text-gray-500">
        {loading ? '加载中…' : `待处理: ${suggestions.length}`}
      </div>
      {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">{error}</div>}
      <SuggestionList suggestions={suggestions} onAccept={accept} onReject={reject} />
    </div>
  );
}
```

- [ ] **Step 3: 修改 scada/page.tsx — 加 "审核队列" 链接**

打开 `packages/web-ui/src/app/scada/page.tsx`,找到 header 内 `← 返回 Dashboard` Link 上方,加:

```tsx
<Link href="/scada/suggestions" className="text-blue-600 hover:underline">
  审核队列
</Link>
```

具体定位 — 现 header 右侧块为:
```tsx
<div className="flex items-center gap-3 text-sm">
  <button ...>+ 新建视图</button>
  <Link href="/dashboard" ...>← 返回 Dashboard</Link>
</div>
```

改为:
```tsx
<div className="flex items-center gap-3 text-sm">
  <button ...>+ 新建视图</button>
  <Link href="/scada/suggestions" className="text-blue-600 hover:underline">审核队列</Link>
  <Link href="/dashboard" ...>← 返回 Dashboard</Link>
</div>
```

- [ ] **Step 4: TS 编译**

Run: `cd packages/web-ui && npx tsc --noEmit`
Expected: 0 new errors

- [ ] **Step 5: 提交**

```bash
git add packages/web-ui/src/app/scada/layout.tsx packages/web-ui/src/app/scada/suggestions/page.tsx packages/web-ui/src/app/scada/page.tsx
git commit -m "feat(web-ui): /scada layout (toast) + /scada/suggestions page + header link"
```

---

## Task 10: 全套验证 + 浏览器 DoD + 最终 review

**Files:** 无新文件

- [ ] **Step 1: 全 vitest 套件**

Run: `cd packages/web-ui && npx vitest run`
Expected: 全绿 (sub-project 5 base 88 + 子项目 6 新增 15 → 103+)

Run: `cd packages/server && npx vitest run`
Expected: 全绿 (新增 2 个测试通过)

Run: `cd packages/data-service && npx vitest run`
Expected: 既有全绿

- [ ] **Step 2: TS 编译总检**

Run: `cd packages/web-ui && npx tsc --noEmit`
Run: `cd packages/server && npx tsc --noEmit`
Run: `cd packages/data-service && npx tsc --noEmit`
Expected: 三个包 0 新错误

- [ ] **Step 3: 浏览器 DoD**

启动:
```bash
cd packages/server && npm start &  # 端口 3001
cd packages/web-ui && npm run dev   # 端口 3000
```

步骤(逐个验证):
1. 浏览器 `http://localhost:3000/login` → `admin / admin123`
2. 进 `/scada` → 顶部 header 右侧应有 "审核队列" 链接
3. 点 "审核队列" → 跳 `/scada/suggestions` → 见 "待处理: 0"(或既有 pending 数)
4. 另一标签 `/scada/demo_v1`(或任一存在 view)→ 点 button widget → 输入 reason "测试 toast" → 提交
5. 右下角应弹 toast: "SCADA 建议 #N — 新写意图: <tag> = <value>"
6. 切回 review 标签 → 500ms 内自动 refetch,新行出现
7. 点 [接受] → 行消失 (server log 有 audit_log 行)
8. 再触发一个 → 点 [拒绝] → 行消失
9. Toast 5s 后自动消失
10. devtools console 0 errors

- [ ] **Step 4: 最终代码 review**

跑 `git log --oneline feat/scada-data-model ^master` 查所有新 commits。

跑 `git diff master...HEAD -- packages/web-ui/src/components/scada/suggestions/ packages/web-ui/src/hooks/useScadaSuggestions.ts packages/web-ui/src/app/scada/ packages/web-ui/src/api/scada.ts packages/web-ui/src/stores/realtime-store.ts packages/server/src/scada-routes.ts packages/server/src/ai-suggestion-engine.ts packages/server/src/index.ts packages/data-service/src/sqlite-service.ts` 整体审。

调用 `everything-claude-code:code-reviewer` 或 `caveman:cavecrew-reviewer` agent 输入子项目 6 diff,确认 0 CRITICAL/HIGH。

- [ ] **Step 5: 总结提交(可选 squash 或保 fine-grained)**

不 squash;保留 task-粒度 commit 历史。

- [ ] **Step 6: 标志子项目完成**

更新 `docs/superpowers/specs/2026-05-15-scada-suggestion-review-design.md` Status: Draft → **Done**(可选)。

最终 commit:
```bash
git add docs/superpowers/specs/2026-05-15-scada-suggestion-review-design.md
git commit -m "docs(scada): mark sub-project 6/7 done"
```
