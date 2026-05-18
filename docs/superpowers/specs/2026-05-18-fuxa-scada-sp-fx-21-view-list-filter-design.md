# SP-FX-21: ViewList 高级 Filter / Search / Sort 设计文档

**Sprint**: SP-FX-21  
**日期**: 2026-05-18  
**状态**: Approved

---

## 1. 背景与目标

SP-FX-13 已交付 ViewListPanel (cards/list 切换 + paginator + URL ?page&size 同步)。  
SP-FX-21 在此基础上加入三类筛选能力：

- **搜索**: 按画面名称模糊匹配 (`?q=`)
- **排序**: name_asc / name_desc / mtime_asc / mtime_desc (`?sort=`)
- **Tag 过滤**: 按 name prefix 分组 (demo_ / prod_ 等), multi-select (`?tag=`)

筛选状态与分页状态统一通过 URL query string 同步, 保证刷新后恢复。

---

## 2. 架构概览

```
ViewListPanel (现)
  ├── ViewListSearchBar (新组件)   ← q / sort / tag 状态 + URL 同步
  ├── ViewListToolbar (现)         ← 保留 viewMode / pageSize
  ├── ViewCardGrid / ViewListRows  ← 不变
  └── ViewPaginator                ← 不变

useViewList (hook 扩展)
  └── 新增 q / sort 参数 → 追加到 ?limit&offset&q&sort URL

scada-routes.ts (现, GET /scada/projects/:projectId)
  └── 读取 q / sort query params → 透传给 sqlite

sqlite-service.ts (listScadaViewsByProject 重载扩展)
  └── 新重载: opts = { limit, offset, q?, sort? }
      → 动态拼接 SQL WHERE name LIKE ? + ORDER BY
```

---

## 3. URL Query 参数设计

| 参数   | 类型                                              | 默认           | 含义              |
|--------|---------------------------------------------------|----------------|-------------------|
| `q`    | string                                            | (空, 不过滤)   | name 模糊匹配     |
| `sort` | `name_asc` \| `name_desc` \| `mtime_asc` \| `mtime_desc` | `name_asc`     | 排序方式          |
| `tag`  | string (逗号分隔, 可多个)                         | (空, 不过滤)   | name prefix 过滤  |
| `page` | number                                            | 1              | 已有              |
| `size` | number                                            | 12             | 已有              |

示例: `?q=demo&sort=mtime_desc&tag=prod,demo&page=1&size=12`

`tag` 过滤为**前端过滤** (对已返回的分页结果), 不传给 server (因 view 无独立 tag 字段, 用 name prefix 暂代)。  
`q` / `sort` 透传至 server 做 SQL 处理。

---

## 4. ViewListSearchBar 组件

**文件**: `packages/web-ui/src/components/scada/pages/ViewListSearchBar.tsx`

### Props

```typescript
interface ViewListSearchBarProps {
  q: string;
  sort: SortKey;
  tags: string[];           // 当前选中的 tag prefixes
  availableTags: string[];  // 从 views 列表推断的所有 prefix
  onChange: (patch: Partial<FilterState>) => void;
}

type SortKey = 'name_asc' | 'name_desc' | 'mtime_asc' | 'mtime_desc';

interface FilterState {
  q: string;
  sort: SortKey;
  tags: string[];
}
```

### 行为

- 搜索 input: 输入时立即更新内部 state, onChange 触发 URL 更新 + 重置 page=1
- sort dropdown: `<select>` 四选项, 切换时 URL 更新 + 重置 page=1
- tag multi-select: 动态从当前 views 提取 name prefix (取 `_` 前缀, 如 `demo_xxx` → `demo`). 点击 tag chip 切换选中. 前端过滤, 不触发 API 请求
- 全部 FilterState 变化通过 `onChange` 回调上报, 由 ViewListPanel 统一更新 URL

---

## 5. ViewListPanel 状态扩展

现 panel 用 `const page / size = ...searchParams` 直读, 扩展为同 pattern:

```typescript
const q = searchParams?.get('q') ?? '';
const sort = (searchParams?.get('sort') as SortKey) ?? 'name_asc';
const tags = (searchParams?.get('tag') ?? '').split(',').filter(Boolean);
```

`handleFilterChange` 合并 q/sort/tag 到 URL (page 重置为 1):

```typescript
const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
  const params = new URLSearchParams({
    page: '1',
    size: String(size),
    q: patch.q ?? q,
    sort: patch.sort ?? sort,
    tag: (patch.tags ?? tags).join(','),
  });
  router.replace(`?${params.toString()}`);
}, [router, size, q, sort, tags]);
```

`useViewList` 调用扩展为传入 `q` / `sort`:

```typescript
const { views, total, loading, error, refetch } = useViewList(projectId, { page, size, q, sort });
```

Tag 过滤为前端过滤 (在 views 列表上 filter), 不传给 hook。

---

## 6. useViewList 扩展

新增 `UseViewListOpts` 字段:

```typescript
export interface UseViewListOpts {
  page?: number;
  size?: number;
  q?: string;      // 新增
  sort?: string;   // 新增
}
```

URL 构建追加参数:

```typescript
if (q) url += (url.includes('?') ? '&' : '?') + `q=${encodeURIComponent(q)}`;
if (sort && sort !== 'name_asc') url += `&sort=${encodeURIComponent(sort)}`;
```

---

## 7. Server 端 (scada-routes.ts)

`GET /scada/projects/:projectId` 扩展读取 `q` / `sort` query params, 校验后透传给 sqlite:

```typescript
const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
const sort = validateSort(req.query.sort);  // 白名单校验
const { views, total } = sqlite.listScadaViewsByProject(req.params.projectId, { limit, offset, q, sort });
```

`validateSort`: 只接受 `name_asc / name_desc / mtime_asc / mtime_desc`, 否则 400。

---

## 8. SQLite Service (listScadaViewsByProject 扩展)

扩展重载签名, 新增 `q` / `sort` 到 opts:

```typescript
opts?: { limit: number; offset: number; q?: string; sort?: string }
```

动态 SQL:
- WHERE: 若 q 非空, 追加 `AND name LIKE ?`, bind `%q%`
- ORDER BY: 根据 sort 映射到 `name ASC` / `name DESC` / `updated_at DESC` / `updated_at ASC`
- 无参数分支 (不带 opts) 保持不变 (向后兼容)

---

## 9. Tag 推断逻辑

从 views 中提取 name prefix:

```typescript
function extractTags(views: ViewMeta[]): string[] {
  const prefixes = new Set<string>();
  for (const v of views) {
    const idx = v.name.indexOf('_');
    if (idx > 0 && idx < v.name.length - 1) prefixes.add(v.name.slice(0, idx));
  }
  return [...prefixes].sort();
}
```

Tag 筛选: `views.filter(v => tags.length === 0 || tags.some(t => v.name.startsWith(t + '_')))`.

---

## 10. 测试计划

### Web-UI Vitest (+8~10 新增)

| 文件 | 测试数 | 内容 |
|------|--------|------|
| `ViewListSearchBar.test.tsx` (新) | 6 | renders, q change, sort change, tag chip, onChange called, empty tags |
| `ViewListPanel.test.tsx` (扩展) | +2 | q/sort URL 同步, tag 前端过滤 |
| `useViewList.test.ts` (扩展) | +2 | q/sort 追加到 URL |

### Server Vitest (+4~5 新增)

| 文件 | 测试数 | 内容 |
|------|--------|------|
| `scada-routes.test.ts` (扩展) | +4 | q 过滤, sort asc/desc, 无效 sort 400, q+sort 组合 |

### PW E2E (+1)

`packages/web-ui/e2e/scada-view-list-filter.spec.ts`:
1. 进 view list → 输入搜索 → 验 URL 含 q → 切 sort → 验 URL 含 sort

---

## 11. 约束确认

- ZERO 新第三方 dep
- 不碰 ViewCard / RuntimeCanvas / widgets / SuggestionsBar / audit middleware / plc-driver
- 不破现有 paginator 测试 (page/size URL pattern 完全保留)
- SP-FX-19/20 改 server/index.ts, 本 sprint 只改 scada-routes.ts, ZERO 重叠
