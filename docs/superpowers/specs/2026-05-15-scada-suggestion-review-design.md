# SCADA Suggestion Review UI + WS Toast 设计 (子项目 6/7)

**Branch:** `feat/scada-data-model`
**Status:** Done
**Scope:** 操作员审核 SCADA 来源 (`source_module='scada'`) write-intent suggestion 的专用 UI + WebSocket 实时弹窗. 操作员 accept/reject 复用现有 REST 端点. **PLC 实际下发延后至子项目 7**。

---

## 1. 上下文

- 子项目 4 已交付: POST `/api/v1/scada/write-intents` 插 `ai_suggestions` 行 (source_module='scada', suggestion_type='widget_button') + WS broadcast `'ai_suggestion'` 通道
- server 已有: GET `/api/v1/ai/suggestions?status=pending&batch_id=...`, POST `/ai/suggestions/:id/accept`, POST `/ai/suggestions/:id/reject` (sub-project 1)
- 现存 `AiSuggestionCard` (dashboard, 30s 轮询, 不区分 source) — 保留不动
- realtime-store 已存 `aiSuggestions: AiSuggestion[]` (前 50, WS handler line 377)

## 2. 架构

```
┌─────────────────── 服务端 (sub-project 4 已就位) ──────────────────┐
│  POST /scada/write-intents                                          │
│    → createSuggestion(...) (source_module='scada')                  │
│    → broadcast('ai_suggestion', { id, action:'created',             │
│                                   source_module:'scada' })          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────── 服务端修改 (本子项目) ───────────────────────────┐
│  GET /ai/suggestions?source_module=scada&status=pending             │
│    新增 query param 支持过滤                                        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────── 客户端 ─────────────────────────────────────────┐
│  realtime-store: case 'ai_suggestion' (现有)                       │
│    → aiSuggestions[0] 头插                                         │
│                                                                    │
│  useScadaSuggestions hook (新):                                    │
│    mount → fetchScadaSuggestions(status='pending', source='scada') │
│    subscribe to store → 当 aiSuggestions[0].id 变 → debounced      │
│                       (500ms) refetch                              │
│                                                                    │
│  /scada/suggestions/page.tsx (新):                                 │
│    SuggestionList + 每行 [接受][拒绝]                              │
│                                                                    │
│  ScadaToast (新, 全局):                                            │
│    mount 在 /scada layout                                          │
│    监听 store 最新 ai_suggestion + source_module='scada'           │
│    右下角 5s 自动消失 stack                                        │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 文件清单

| 文件 | 职责 | 测试 |
|---|---|---|
| `app/scada/layout.tsx` | 包 /scada/* + mount ScadaToast | (DoD) |
| `app/scada/suggestions/page.tsx` | review 队列页 | (DoD) |
| `app/scada/page.tsx` (修改) | 加 "审核队列" 链接 | (DoD) |
| `components/scada/suggestions/SuggestionList.tsx` | N 行列表 + 空态 | 3 |
| `components/scada/suggestions/SuggestionRow.tsx` | 单行 (tag/value/reason/widget_id/[接受][拒绝]) | 2 |
| `components/scada/suggestions/ScadaToast.tsx` | 右下角 stack toast | 3 |
| `hooks/useScadaSuggestions.ts` | store 订阅 + fetch + accept/reject + debounced refetch | 4 |
| `api/scada.ts` (修改) | + `fetchScadaSuggestions` + `acceptSuggestion` + `rejectSuggestion` | (隐式 via hook) |
| `stores/realtime-store.ts` (修改) | `AiSuggestion` interface 加 source_module? | 1 |
| `packages/server/src/index.ts` (修改) | GET `/ai/suggestions` 加 `source_module` query 过滤 | 2 |
| `packages/data-service/src/sqlite-service.ts` (修改) | `getPendingSuggestionsBySource(batchId?, source?)` 方法 | (隐式) |
| `packages/server/src/scada-routes.ts` (修改) | broadcast payload 加 source_module 字段 | (现有测试覆盖) |
| `packages/server/src/ai-suggestion-engine.ts` (修改) | 同上, 保 source 字段加 source_module | (无测试) |

依赖: 无新 npm.

### 2.2 测试矩阵 (~15)

| 测试 | Case | 描述 |
|---|---|---|
| realtime-store.scada-source.test | 1 | ai_suggestion payload with source_module → store entry 含字段 |
| useScadaSuggestions.test | 1 | mount → fetchScadaSuggestions(source_module=scada) 调用 |
| | 2 | accept(id) → POST + 本地 filter |
| | 3 | reject(id) → POST + 本地 filter |
| | 4 | store aiSuggestions 头插 → debounced refetch (timer mock) |
| SuggestionList.test | 1 | empty → 空态 |
| | 2 | N rows → N×SuggestionRow |
| | 3 | accept callback 触发 |
| SuggestionRow.test | 1 | 渲染 target_param + suggested_value + reasoning JSON 摘要 + widget_id link |
| | 2 | reasoning 非 JSON → 原文显示 |
| ScadaToast.test | 1 | scada source suggestion 到达 → toast 入 stack |
| | 2 | 非-scada source → 不入 stack |
| | 3 | 5s 后 stack 移除 (fake timer) |
| scada-routes.test (server, +2) | 1 | GET /ai/suggestions?source_module=scada → 仅 source='scada' 行 |
| | 2 | 无 source_module → 全 pending (向后兼容) |

## 3. 服务端修改

### 3.1 GET /ai/suggestions — 加 source_module 过滤

修改 `packages/server/src/index.ts` 内 `apiRouter.get('/ai/suggestions', ...)` 块. 当前实现:

```ts
if (status === 'pending') {
  sqlite.expirePendingSuggestions(batchId || '');
  res.json(sqlite.getPendingSuggestions(batchId));
} else {
  const rows = sqlite.getDatabase().prepare(/* ... */).all(...);
  res.json(rows);
}
```

改为:

```ts
const source = req.query.source_module as string | undefined;
if (status === 'pending') {
  sqlite.expirePendingSuggestions(batchId || '');
  res.json(sqlite.getPendingSuggestionsBySource(batchId, source));
} else {
  const clauses: string[] = ['status = ?'];
  const params: any[] = [status];
  if (batchId) { clauses.push('batch_id = ?'); params.push(batchId); }
  if (source) { clauses.push('source_module = ?'); params.push(source); }
  const sql = `SELECT * FROM ai_suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 50`;
  res.json(sqlite.getDatabase().prepare(sql).all(...params));
}
```

### 3.2 data-service — getPendingSuggestionsBySource

在 `packages/data-service/src/sqlite-service.ts` 加方法 (插在现有 `getPendingSuggestions` 之后):

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

不修改现有 `getPendingSuggestions` (向后兼容).

### 3.3 scada-routes.ts broadcast payload

`packages/server/src/scada-routes.ts` 现 broadcast:

```ts
broadcast('ai_suggestion', { id: suggestion_id, action: 'created', source: 'scada' });
```

改为含完整 toast 所需字段:

```ts
broadcast('ai_suggestion', {
  id: suggestion_id,
  action: 'created',
  source: 'scada',                                          // 保留, 向后兼容
  source_module: 'scada',                                   // 新增, 客户端过滤用
  target_param: tag,                                        // toast 显示
  suggested_value: typeof value === 'number' ? value : null, // toast 显示
});
```

这样 ScadaToast 可直接读 `latest.target_param` + `latest.suggested_value` 显示 "新写意图: F01.SP-temp = 38" 而无需额外 fetch.

### 3.4 ai-suggestion-engine.ts broadcast

`packages/server/src/ai-suggestion-engine.ts` line ~188 同样模式 (broadcast payload 加 source_module='ai_auto' 或 engine 当前 source).

不动 `mqtt-subscriber.ts` 内 `broadcast('suggestion_new', ...)` (不同 channel, 不影响本子项目).

## 4. 客户端

### 4.1 api/scada.ts 扩展

追加到现有文件 (sub-project 4 + 5):

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

### 4.2 hooks/useScadaSuggestions.ts

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

### 4.3 SuggestionList + SuggestionRow

```tsx
// SuggestionList.tsx
export function SuggestionList({
  suggestions, onAccept, onReject,
}: {
  suggestions: ScadaSuggestion[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}) {
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

// SuggestionRow.tsx
export function SuggestionRow({
  suggestion, onAccept, onReject,
}: {
  suggestion: ScadaSuggestion;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}) {
  let meta: { reason?: string; view_id?: string; widget_id?: string; value?: any } = {};
  try {
    if (suggestion.reasoning) meta = JSON.parse(suggestion.reasoning);
  } catch { /* keep meta empty, fallback to raw reasoning */ }

  return (
    <div className="border rounded p-3 bg-white space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-sm">{suggestion.target_param}</div>
        <span className="text-xs text-gray-400">#{suggestion.id} · {suggestion.created_at}</span>
      </div>
      <div className="text-sm">
        <span className="text-gray-500">建议值:</span>{' '}
        <span className="font-mono">{suggestion.suggested_value ?? (meta.value ?? '—')}</span>
      </div>
      <div className="text-xs text-gray-600">
        理由: {meta.reason ?? suggestion.reasoning ?? '—'}
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

### 4.4 ScadaToast

```tsx
const TOAST_TTL_MS = 5000;
const STACK_MAX = 3;

interface ToastItem { id: number; suggestionId: number; msg: string; }

export function ScadaToast() {
  const [stack, setStack] = useState<ToastItem[]>([]);
  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);
  const seenIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!latest) return;
    const src = (latest as any).source_module;
    if (src !== 'scada') return;
    if (seenIdsRef.current.has(latest.id)) return;
    seenIdsRef.current.add(latest.id);

    const item: ToastItem = {
      id: Date.now() + Math.random(),
      suggestionId: latest.id,
      msg: `新写意图: ${latest.target_param} = ${latest.suggested_value ?? '—'}`,
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

### 4.5 /scada/layout.tsx

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

### 4.6 /scada/suggestions/page.tsx

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
          <button onClick={refetch} className="text-blue-600 hover:underline">刷新</button>
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

### 4.7 /scada/page.tsx 修改

在 header 右侧 "+ 新建视图" 旁边加链接:

```tsx
<Link href="/scada/suggestions" className="text-blue-600 hover:underline">
  审核队列
</Link>
```

不显示动态计数 (避免再加 fetch — toast 已涵盖实时提示).

## 5. realtime-store 修改

`AiSuggestion` interface (line 28) 当前字段不含 `source_module`. 加可选字段:

```ts
interface AiSuggestion {
  id: number;
  // ... existing fields ...
  source_module?: string;
}
```

`case 'ai_suggestion'` (line 377) 已 spread payload 入 store, 无需修改 dispatch. 测试覆盖 payload 含 source_module → store entry 也有该字段.

## 6. 不做的事

- Accept → 实际 PLC 写 (子项目 7: engine 监听 accepted suggestions → S7/Modbus 下发)
- 历史 (accepted/rejected) 列表 (现 audit-logs 页足够)
- Bulk accept/reject
- 按 reactor / view 过滤
- AI + SCADA 混合队列
- 通知中心 / 桌面通知
- Reason 二次编辑 / 评论
- 多操作员协作 (同一 suggestion 谁先 accept)

## 7. 风险

| 风险 | 缓解 |
|---|---|
| WS payload schema 不一致 (现 `source` vs 新 `source_module`) | server 同时设两字段, client 优先 source_module |
| store.aiSuggestions 限 50 → 高峰丢失 | review 页直接 GET REST 不依赖 store list; store 仅为 toast 触发器 |
| Toast spam | stack 限 3, dedup via seenIdsRef Set |
| Optimistic accept 后 server 失败 | hook 内 try/catch 失败回滚 + 重新 fetch (本子项目: 简单实现, 错误 alert) |
| 操作员误 accept | 子项目 6 直接 POST 无二次确认; accept 仅入审计 (无 PLC 实际影响); 子项目 7 加 confirm before PLC 写 |
| pending expire | server expirePendingSuggestions 已每 GET 调用一次 |
| 现有 AiSuggestionCard dashboard 30s 轮询 | 不动 dashboard 卡; 互不干扰 |

## 8. 验收 (DoD)

- 15 vitest cases 全绿 (sub-project 5 = 88; sub-project 6 +15 → 103+)
- TS 编译 0 新错误
- 浏览器 DoD:
  1. login admin → `/scada` 顶部 "审核队列" 链接可见
  2. 点链接 → `/scada/suggestions` 加载, 显示 "待处理: N"
  3. 另一窗口 `/scada/demo_v1` → 点 button → reason "测试" → 提交 → 见 toast 右下角 "新写意图 F01.SP-temp = 38" + [查看] 链接
  4. 切回 review 页 → 看到新行 (debounced refetch 触发)
  5. 点 [接受] → POST accept → 行消失
  6. 另一 widget click → 新行 → 点 [拒绝] → 消失
  7. Toast 5s 自动消失
  8. server log 含 accept/reject audit_log 行
  9. 0 console errors

---

## 9. 实施顺序 (~10 任务)

1. data-service: getPendingSuggestionsBySource
2. server: GET /ai/suggestions source_module query + 2 测试
3. server: scada-routes broadcast 加 source_module + ai-suggestion-engine 同样改 (无测试)
4. api/scada.ts: fetchScadaSuggestions + acceptSuggestion + rejectSuggestion
5. realtime-store: AiSuggestion interface 加 source_module + 1 测试
6. useScadaSuggestions hook + 4 测试
7. SuggestionList + SuggestionRow + 5 测试
8. ScadaToast + 3 测试
9. /scada/layout.tsx + /scada/suggestions/page.tsx + index page link
10. 全套测试 + TS + 浏览器 DoD + 最终 review

(writing-plans 阶段定 final 顺序)
