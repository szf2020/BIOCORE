# SP-FX-13 设计规格: View List Cards-View + Paginator

**Sprint**: SP-FX-13  
**日期**: 2026-05-18  
**状态**: APPROVED  
**Baseline**: web-ui 982 vitest, server 147, PW 39/36 pass/3 skip

---

## 1. 背景与目标

现 `/scada2` 页面通过 `ViewListPanel` 渲染一个 `<ul>` 紧凑列表。随着画面数量增长，用户需要：
- 卡片式视图（更直观，含缩略图）
- 翻页（避免全量加载）
- 视图模式切换（cards / list 双模式）
- 持久化用户偏好与 URL 同步

---

## 2. Part 1: Server 分页支持

### 2.1 现状
`GET /api/v1/scada/projects/:projectId` 返回 `{ ...meta, views: ScadaViewMeta[] }` — 全量，无分页。

### 2.2 变更
在 `scada-routes.ts` 的 `GET /scada/projects/:projectId` 中增加可选 query 参数：
- `?limit=N` (default 无限制, 向后兼容)
- `?offset=N` (default 0)

**响应格式 — 向后兼容双字段**:
```json
{
  "project_id": "...",
  "name": "...",
  "views": [...],
  "total": 42
}
```

若不传 `limit`, 则 `total` = `views.length`, 行为与现在完全相同。

### 2.3 data-service 变更
`SQLiteService.listScadaViewsByProject` 增加重载，支持 opts 参数：
```typescript
listScadaViewsByProject(projectId: string): ScadaViewMeta[]
listScadaViewsByProject(projectId: string, opts: { limit: number; offset: number }): { views: ScadaViewMeta[]; total: number }
```
底层：COUNT query + LIMIT/OFFSET query。现有调用者（无 opts）走旧路径，不破现有行为。

---

## 3. Part 2: cards-view UI

### 3.1 新组件树
```
ViewListPanel (现有, 扩展)
├── ViewListToolbar        (新)  — view-mode toggle + page-size selector
├── ViewCardGrid           (新)  — responsive CSS grid, cards mode
│   └── ViewCard           (新)  — 单卡片
├── ViewListRows           (新)  — 原 <ul> list mode, 从 ViewListPanel 提取
└── ViewPaginator          (新)  — prev/next + page numbers + page-size
```

### 3.2 ViewCard 内容
- **name**: 视图名称
- **thumbnail**: mini SVG preview — svgcontent 前 400 chars 放入 `<svg>` 容器内，overflow hidden，pointer-events none
- **updated_at**: 人类可读时间 (locale 相对时间)
- **操作按钮**: open / edit / duplicate / delete (Lucide icons: ExternalLink / Pencil / Copy / Trash2)

### 3.3 Responsive Grid
```
grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4
```

### 3.4 Toggle 逻辑
- `ViewListToolbar` 提供 cards/list 双 icon 按钮 (Lucide: LayoutGrid / List)
- `data-testid="view-mode-cards"` / `data-testid="view-mode-list"`
- 状态提升到 `ViewListPanel`
- localStorage key: `biocore.scada.viewListMode` (值: `"cards"` | `"list"`, default `"cards"`)

### 3.5 duplicate 操作
ViewCard 的 duplicate 按钮调用现有 `useViewMutations.create({ cloneFrom: viewId })`，newName = `${原名} (副本)`。

---

## 4. Part 3: Paginator

### 4.1 URL query 参数
- `?page=N` (1-indexed, default 1)
- `?size=N` (默认 12, 可选 12/24/48)

### 4.2 读取 URL
在 `ViewListPanel` 内部通过 `useSearchParams` 读取 page/size。

### 4.3 写入 URL
通过 `useRouter().replace` 无滚动更新 URL query。

### 4.4 ViewPaginator 组件
- prev / page-numbers (max 7 visible，中间省略号) / next
- page-size selector: `<select>` 12/24/48
- `data-testid="paginator"` + `data-testid="page-btn-{N}"` + `data-testid="page-size-select"`

---

## 5. Part 4: 测试

### 5.1 vitest 新增 (期望 +30, 总 1012+)
| 文件 | 测试点 |
|------|--------|
| `ViewCard.test.tsx` | 渲染 name/time; 按钮回调; duplicate 调用 create |
| `ViewCardGrid.test.tsx` | grid className; cards 数量 |
| `ViewPaginator.test.tsx` | page numbers max 7; prev/next disabled; page-size change |
| `ViewListToolbar.test.tsx` | toggle 回调; active state |
| `ViewListPanel.test.tsx` (追加) | localStorage 读取偏好; URL page/size 同步 |
| server `scada-routes.test.ts` (追加) | limit/offset 分页; total 字段; 无参数兼容旧 |
| data-service `sqlite-service.test.ts` (追加) | listScadaViewsByProject with opts |

### 5.2 E2E PW (新增 1 spec)
文件: `e2e/scada-cards-view.spec.ts`

步骤:
1. login
2. 导航 `/scada2`
3. 断言默认 cards view (`[data-testid="view-card"]` 可见)
4. 点 list toggle → 断言 `[data-testid="view-row"]` 可见
5. 点 cards toggle → 恢复 cards
6. 点击第一个 card 的 edit 链接 → 导航编辑器

---

## 6. 约束与不变量

- **ZERO 新第三方 dep** — Tailwind grid + Lucide icons (已装)
- **animation-engine.ts T8 安全不变量不触碰**
- **向后兼容**: 旧调用无 limit/offset 行为不变
- **localStorage 仅持久化 viewMode**; page/size 通过 URL 持久
- **server 分页**: SQL LIMIT/OFFSET, 非前端 slice
- **thumbnail**: svgcontent 不存在时显示占位灰色方块

---

## 7. 文件变更清单

**新增 (web-ui)**:
- `src/components/scada/pages/ViewCard.tsx`
- `src/components/scada/pages/ViewCardGrid.tsx`
- `src/components/scada/pages/ViewListToolbar.tsx`
- `src/components/scada/pages/ViewListRows.tsx`
- `src/components/scada/pages/ViewPaginator.tsx`
- `src/components/scada/pages/__tests__/ViewCard.test.tsx`
- `src/components/scada/pages/__tests__/ViewCardGrid.test.tsx`
- `src/components/scada/pages/__tests__/ViewPaginator.test.tsx`
- `src/components/scada/pages/__tests__/ViewListToolbar.test.tsx`
- `e2e/scada-cards-view.spec.ts`

**修改 (web-ui)**:
- `src/components/scada/pages/ViewListPanel.tsx`
- `src/hooks/useViewList.ts`
- `src/hooks/__tests__/useViewList.test.ts`
- `src/components/scada/pages/__tests__/ViewListPanel.test.tsx`

**修改 (server)**:
- `src/scada-routes.ts`
- `src/__tests__/scada-routes.test.ts`

**修改 (data-service)**:
- `src/sqlite-service.ts`
