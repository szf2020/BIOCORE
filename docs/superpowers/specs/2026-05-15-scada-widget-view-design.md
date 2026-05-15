# SCADA 渲染层设计 (子项目 4/7)

**Branch:** `feat/scada-data-model`
**Status:** Draft
**Scope:** SCADA viewer (read-only). 编辑器 (sub-project 5) 不在范围。

---

## 1. 上下文

- 子项目 1 已交付: `scada_projects` + `scada_views` 表, REST + WS broadcasts (`scada:view:saved` `scada:view:deleted` `scada:project:saved` `scada:project:deleted`).
- 子项目 2 已交付: `useTag` + `useTagHistory` hooks + realtime-store WS dispatch (10 channel, 暂无 scada).
- 子项目 3 已交付: 8 widget + `BoundWidget` wrapper + `WIDGET_REGISTRY` + `compileTransform`. Button 触发 `widget-action` CustomEvent on `document`.
- `ai_suggestions` 表 + `sqlite.createSuggestion()` 已就位; GET/accept/reject 端点已实现; **缺**: POST create.
- 旧 `/dashboard/hmi/page.tsx` (FUXA iframe, 122 行) 保留至 sub-project 5 编辑器上线后再 deprecate, 本子项目不动它。

## 2. 架构

```
┌─────────────────────────── /scada (索引页) ──────────────────────────┐
│  GET /scada/projects                                                  │
│  GET /scada/projects/:projectId  → views[]                            │
│  →  table: project → view 链接 /scada/[viewId]                        │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────── /scada/[viewId] (viewer) ───────────────────┐
│  GET /scada/views/:viewId → { width, height, background, items_json } │
│                                                                       │
│  <ViewActionRouter>                  // mount-once event listener     │
│    <WidgetView view={view}>          // 画布                          │
│      {items.map(item =>                                               │
│        <BoundWidget                                                   │
│          key={item.id + ':' + (item.bindings?.length ?? 0)}           │
│          widget={item} />)}                                           │
│    </WidgetView>                                                      │
│    <WriteIntentDialog open={...} pending={...} onSubmit={...} />      │
│  </ViewActionRouter>                                                  │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.1 客户端组件清单

| 文件 | 职责 | 测试数 |
|---|---|---|
| `app/scada/page.tsx` | 项目 + 视图索引, 链接 viewer | (manual DoD) |
| `app/scada/[viewId]/page.tsx` | 全屏 viewer 容器 | (manual DoD) |
| `components/scada/WidgetView.tsx` | 画布渲染 N×BoundWidget | 3 |
| `components/scada/ViewActionRouter.tsx` | `widget-action` 监听 + dialog 状态 | 2 |
| `components/scada/WriteIntentDialog.tsx` | 操作员确认 modal | 3 |
| `api/scada.ts` | REST client (fetchView / fetchProjects / submitWriteIntent) | (隐式) |
| `stores/realtime-store.ts` | 扩展: scada:view:saved → `_viewSavedTick(view_id)` | 2 |

### 2.2 服务端修改

- `packages/server/src/scada-routes.ts`: 新增 `POST /api/v1/scada/write-intents` (admin/engineer/operator)
- `packages/server/src/__tests__/scada-routes.test.ts`: +3 集成测试

## 3. 数据流

### 3.1 加载视图

```
mount /scada/[viewId]/page.tsx
  → fetchView(viewId)
  → GET /api/v1/scada/views/:viewId  (无 auth gate, sub-project 1 已设计)
  → response { view_id, project_id, name, width, height, background,
               items_json, updated_at, ... }
  → setState(view, items = Object.values(view.items_json))
  → <WidgetView>
```

### 3.2 实时 tag

子项目 3 已就位: BoundWidget → useTag → realtime-store. 本子项目不修改 hook 链.

### 3.3 Button 写意图 (建议缓冲区)

```
sub-project 3 Button click
  → document.dispatchEvent(new CustomEvent('widget-action',
      { detail: { widgetId, action, payload } }))

ViewActionRouter (mount once at viewer level)
  → handler(e):
      setPending({ widgetId, action, payload })
      open WriteIntentDialog

WriteIntentDialog
  → 操作员输 reason (textarea, ≥3 字符 校验, submit disabled until valid)
  → 取消 → close, pending=null
  → 提交 →
      api.submitWriteIntent({
        tag: payload?.tag ?? action,
        value: payload?.value ?? null,
        reason,
        view_id,
        widget_id: widgetId,
        batch_id: payload?.batch_id ?? null,
      })
  → 200 → toast "建议 #ID 已提交" + close
  → 4xx → toast 错误 + 保持打开 (用户可改 reason 重试)
```

### 3.4 协同更新 (其他用户保存)

```
WS 'scada:view:saved' { view_id, updated_at, updated_by }
  → realtime-store dispatch → set _scadaViewSavedTick({ view_id, updated_at })
  → viewer useEffect 观察 _scadaViewSavedTick:
      if (tick.view_id === currentViewId && tick.updated_at !== currentUpdatedAt)
        refetchView()
```

非阻塞: 用户操作不被打断, 后台 refetch 后 setState 触发 re-render. BoundWidget remount 由 key 处理 (id+bindings.len).

## 4. Server: POST /scada/write-intents

### 4.1 接口

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| `tag` | string | ✓ | non-blank |
| `value` | number\|string\|boolean\|null | ✗ | (类型仅限 4 种) |
| `reason` | string | ✓ | trim().length ≥ 3 |
| `view_id` | string | ✓ | non-blank |
| `widget_id` | string | ✓ | non-blank |
| `batch_id` | string\|null | ✗ | (透传) |

**Response 200:** `{ success: true, suggestion_id: <number> }`

**Response 400:**
- `{ error: 'missing_required_fields' }` (tag/reason/view_id/widget_id 缺一)
- `{ error: 'reason_too_short' }` (reason trim < 3)
- `{ error: 'invalid_value_type' }` (value 非 number/string/boolean/null)

**Response 401/403:** 无 user / role 不允许.

### 4.2 服务端实现要点

```ts
apiRouter.post('/scada/write-intents',
  requireRole('admin', 'engineer', 'operator'),
  (req, res) => {
    const { tag, value, reason, view_id, widget_id, batch_id } = req.body ?? {};
    if (isBlankString(tag) || isBlankString(view_id) || isBlankString(widget_id) || isBlankString(reason))
      return res.status(400).json({ error: 'missing_required_fields' });
    if (reason.trim().length < 3)
      return res.status(400).json({ error: 'reason_too_short' });
    if (value !== null && value !== undefined &&
        !['number', 'string', 'boolean'].includes(typeof value))
      return res.status(400).json({ error: 'invalid_value_type' });

    const suggestion_id = sqlite.createSuggestion({
      batch_id: (typeof batch_id === 'string' && batch_id) ? batch_id : 'manual',
      suggestion_type: 'widget_button',
      source_module: 'scada',
      target_param: tag,
      suggested_value: typeof value === 'number' ? value : undefined,
      reasoning: JSON.stringify({ reason, value, view_id, widget_id }),
    });

    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_write_intent',
      target_type: 'ai_suggestion',
      target_id: String(suggestion_id),
      new_value: JSON.stringify({ tag, value, view_id, widget_id, reason }),
      ip_address: getIp(req),
    });

    broadcast('ai_suggestion', { id: suggestion_id, action: 'created', source: 'scada' });
    res.json({ success: true, suggestion_id });
  });
```

### 4.3 安全约束

- **永不直写 PLC** (项目铁律). 端点仅插 `ai_suggestions`, 由 operator 在既有 accept UI 二次确认后 engine 下发.
- reason 文本入 audit log, 不可撤销.
- ip_address 入 audit, 便于追溯.

## 5. 索引页 `/scada/page.tsx`

简表:
- 顶部: 项目下拉 (load projects)
- 主体: 当前项目下视图列表 (load views via project.views or `/scada/reactors/:id/views` 备选)
- 每行: 视图名 + reactor_id + 「进入」链接 `/scada/[viewId]`
- 空态: "暂无视图, 子项目 5 编辑器待上线"
- 行级新增 / 编辑 → 不做 (子项目 5)

实现:
- Next.js client component, useEffect fetch projects, 简单 select + table
- TanStack Query 暂不引入, 本子项目 useState + fetch 够用

## 6. Viewer 页 `/scada/[viewId]/page.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchView } from '@/api/scada';
import { useRealtimeStore } from '@/stores/realtime-store';
import { WidgetView } from '@/components/scada/WidgetView';
import { ViewActionRouter } from '@/components/scada/ViewActionRouter';

export default function ScadaViewerPage() {
  const { viewId } = useParams() as { viewId: string };
  const [view, setView] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const savedTick = useRealtimeStore(s => s._scadaViewSavedTick);

  const reload = () => fetchView(viewId).then(setView).catch(e => setErr(String(e)));

  useEffect(() => { reload(); }, [viewId]);
  useEffect(() => {
    if (savedTick?.view_id === viewId && savedTick.updated_at !== view?.updated_at) reload();
  }, [savedTick]);

  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!view) return <div className="p-6">加载中...</div>;
  return (
    <ViewActionRouter viewId={viewId}>
      <WidgetView view={view} />
    </ViewActionRouter>
  );
}
```

## 7. realtime-store 扩展

```ts
// 新字段
_scadaViewSavedTick: { view_id: string; updated_at: string } | null;

// 新 dispatch case (在已有 ws message switch 里)
case 'scada:view:saved':
  set({ _scadaViewSavedTick: { view_id: payload.view_id, updated_at: payload.updated_at } });
  break;
case 'scada:view:deleted':
  set({ _scadaViewSavedTick: { view_id: payload.view_id, updated_at: 'deleted' } });
  break;
```

Test 覆盖: 2 cases (dispatch view:saved → tick set; dispatch view:deleted → tick.updated_at='deleted').

## 8. 测试矩阵 (~13)

| 文件 | Case | 描述 |
|---|---|---|
| WidgetView.test.tsx | 1 | items={} → 空画布 (0 BoundWidget) |
| WidgetView.test.tsx | 2 | 3 items → 3 BoundWidget mount, 各 key 含 bindings.length |
| WidgetView.test.tsx | 3 | view.width/height/background 应用为 inline style |
| ViewActionRouter.test.tsx | 1 | dispatchEvent widget-action → dialog 出现 with widgetId |
| ViewActionRouter.test.tsx | 2 | unmount → listener removed (再 dispatch 不触发 state) |
| WriteIntentDialog.test.tsx | 1 | reason="" → submit disabled |
| WriteIntentDialog.test.tsx | 2 | reason="aa" → submit disabled; reason="aaa" → enabled |
| WriteIntentDialog.test.tsx | 3 | submit → fetch 调用 with body, 成功 → onClose called |
| realtime-store.scada.test.ts | 1 | ws msg scada:view:saved → _scadaViewSavedTick={view_id, updated_at} |
| realtime-store.scada.test.ts | 2 | ws msg scada:view:deleted → tick.updated_at='deleted' |
| scada-routes.test.ts (server) | +1 | POST write-intents success → 200 + suggestion row + audit row + broadcast |
| scada-routes.test.ts (server) | +2 | 缺 reason → 400 missing_required_fields; reason="aa" → 400 reason_too_short |
| scada-routes.test.ts (server) | +3 | viewer role 调用 → 403 (operator 允许, viewer 不允许) |

Web-UI mock 策略:
- `WidgetView.test`: 不真渲染 BoundWidget — `vi.mock('@/widgets', () => ({ BoundWidget: ({widget}: any) => <div data-testid="bw" data-id={widget.id} data-blen={widget.bindings?.length ?? 0}/> }))`
- `ViewActionRouter.test`: render with children stub, dispatchEvent on document
- `WriteIntentDialog.test`: global fetch mock

## 9. 文件结构 (新)

```
packages/web-ui/src/
  app/scada/
    page.tsx                       # 新建 (~80 行)
    [viewId]/page.tsx              # 新建 (~50 行)
  components/scada/                # 新建目录
    WidgetView.tsx                 # ~50 行
    ViewActionRouter.tsx           # ~70 行
    WriteIntentDialog.tsx          # ~80 行
    __tests__/
      WidgetView.test.tsx
      ViewActionRouter.test.tsx
      WriteIntentDialog.test.tsx
  api/scada.ts                     # 新建 ~40 行
  stores/realtime-store.ts         # 修改: +字段 +case
  stores/__tests__/realtime-store.scada.test.ts  # 新建

packages/server/src/
  scada-routes.ts                  # 修改: +endpoint
  __tests__/scada-routes.test.ts   # 修改: +3 cases
```

依赖: 无新 npm 包.

## 10. 不做的事

- 编辑器 UI (拖拽 / 工具面板 / items 持久化) → sub-project 5
- 视图缩放 / 平移 (zoom / pan / fit) → 后续
- View 切换动画 / 标签页 → 后续
- Suggestion accept/reject UI 改造 → 已有页够用
- Multi-tab 同步 ACK → 后续
- 离线缓存 (Service Worker) → 后续
- Widget action 类型枚举 (open_suggest_dialog 之外) → sub-project 6+
- 把 widget_action 拆独立表 (现入 ai_suggestions reasoning JSON) → 子项目 5/6 拆

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| BoundWidget hook rules (bindings 数量变化) | runtime crash | WidgetView key={id+':'+len} 强 remount, 已在 sub-project 3 spec 文档 |
| items_json 大尺寸 (>100 KB) | server reject | sub-project 1 已设 SCADA_ITEMS_MAX_BYTES; client 信任 server, 仅 try/catch fetch |
| 非数字 value 入 ai_suggestions | schema 类型限 numeric | reasoning JSON 序列化原始 value, source_module='scada' + suggestion_type='widget_button' 可识别 |
| WS race: 操作员保存中切 view | 数据不一致 | viewer useEffect 比对 view_id, 不影响当前 view |
| 操作员误点 button | 触发未授权写意图 | reason ≥3 字符 + cancel + audit_log 留痕 + 二次 accept 才下发 |
| FUXA iframe 旧页未删 | 双入口困惑 | 暂保留, sub-project 5 上线后 deprecate (本子项目不动) |
| Next.js App Router useParams 类型 | TS 严格模式 | `useParams() as { viewId: string }` cast (Next 14 范式) |

## 12. 验收 (DoD)

- 13 vitest cases 全绿 (sub-project 3 51 cases 仍绿, 累计 64+)
- TS 编译 0 新错误
- 浏览器 DoD:
  1. 通过 SQL 直插 demo project + view (sub-project 5 编辑器前):
     ```sql
     INSERT OR IGNORE INTO scada_projects(project_id,name) VALUES('demo_proj','Demo');
     INSERT OR IGNORE INTO scada_views(view_id,project_id,name,reactor_id,items_json)
       VALUES('demo_v1','demo_proj','示例','F01',
       '{"t1":{"id":"t1","type":"tank","x":20,"y":20,"w":80,"h":200,"props":{"label":"罐温","color":"#3b82f6","max":100,"unit":"°C"},"bindings":[{"tag":"F01.AI-0","prop":"fillPct","transform":"Math.min(100, (v/50)*100)"}]},"b1":{"id":"b1","type":"button","x":140,"y":20,"w":120,"h":40,"props":{"text":"测试写意图","action":"open_suggest_dialog","payload":{"tag":"F01.SP-temp","value":38}}}}');
     ```
  2. 打开 `/scada` → 索引列 demo_proj + demo_v1
  3. 点 demo_v1 → `/scada/demo_v1` → tank 显示, fillPct 来自 F01.AI-0
  4. 点击 button → 弹 WriteIntentDialog
  5. 填 reason "测试" → 提交 → toast 显示 suggestion_id, audit_log + ai_suggestions 表各 +1 行
  6. 另一会话 PUT `/scada/views/demo_v1` 改 items_json → 当前 viewer 自动 refetch

---

## 13. 实施顺序 (~11 任务)

1. realtime-store 扩展 + 2 测试
2. `api/scada.ts` (fetchView/fetchProjects/submitWriteIntent)
3. WidgetView + 3 测试
4. ViewActionRouter + 2 测试
5. WriteIntentDialog + 3 测试
6. `app/scada/page.tsx` (索引)
7. `app/scada/[viewId]/page.tsx` (viewer)
8. Server: POST /scada/write-intents + 3 integration tests
9. 全套测试 + TS 编译
10. 浏览器 DoD (手工创建 demo 视图)
