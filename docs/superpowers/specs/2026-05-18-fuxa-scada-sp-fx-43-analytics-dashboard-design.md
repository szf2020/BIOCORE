# SP-FX-43 Analytics Dashboard — Design Spec

日期: 2026-05-18  
Sprint: SP-FX-43  
状态: DRAFT

---

## 1. 背景与目标

BIOCore 目前缺乏业务使用度量界面。  
audit_log (SP-FX-19) 已记录用户操作，ai_suggestions 已记录建议状态，fuxa_views / scada_views 存放画面数据。  
本 sprint 在这些现有表上做聚合查询，生成 4 类分析指标，并在 `/scada2/analytics` 提供管理员仪表盘。

**无需新建数据库表**，全部读现有表。

---

## 2. 现有 Schema 摘要

### audit_log (034-audit-log.sql)
```
id, user_id, action, resource_type, resource_id, payload, ip, timestamp
```
- `resource_type`: 'batches', 'recipes', 'views', 'scada', etc.
- `action`: HTTP method (POST, PUT, DELETE, etc.)
- `user_id`: JWT sub，未认证时 NULL

### scada_views (028-scada-schema.sql)
```
view_id, project_id, name, reactor_id, items_json, updated_at
```
- `items_json`: JSON 对象，key 为 widget id，value 含 `type` 字段

### fuxa_views (033-fuxa-views.sql)
```
id, name, type, payload, width, height, parent_view_id, is_template, version,
created_at, updated_at, created_by, updated_by
```
- `payload`: FuxaView JSON，含 items 数组，各 item 有 `type` 字段

### ai_suggestions (001-baseline-schema.sql)
```
id, batch_id, suggestion_type, source_module, target_param, current_value,
suggested_value, confidence, reasoning,
status CHECK('pending','accepted','rejected','expired','superseded'),
created_at, expires_at, decided_by, decided_at
```
- write-intent accept/reject: status IN ('accepted','rejected')
- `reasoning` 含拒绝原因文本（无独立 reject_reason 列，用 reasoning 归类）

---

## 3. 4 类指标 SQL 模板

### 3.1 View 访问次数排名 (`/analytics/view-usage`)

```sql
SELECT resource_id AS view_id,
       COUNT(*) AS access_count
FROM audit_log
WHERE resource_type IN ('scada','views')
  AND timestamp >= datetime('now', :range)
GROUP BY resource_id
ORDER BY access_count DESC
LIMIT 20
```

range 参数示例: '-7 days', '-30 days', '-90 days'

### 3.2 Widget 类型使用频次 (`/analytics/widget-types`)

因 widget 信息存在 JSON 字段中，通过服务层 JS 解析：
1. `SELECT items_json FROM scada_views` → 解析 JSON → 统计每个 widget 的 `type` 字段
2. `SELECT payload FROM fuxa_views WHERE type='svg'` → 解析 FuxaView JSON → 统计 item type
3. 两路合并后排序输出

辅助 SQL:
```sql
SELECT items_json FROM scada_views
WHERE updated_at >= datetime('now', :range)
```
```sql
SELECT payload FROM fuxa_views
WHERE updated_at >= datetime('now', :range)
  AND is_template = 0
```

### 3.3 用户活跃度 (`/analytics/user-activity`)

日活 DAU:
```sql
SELECT date(timestamp) AS day,
       COUNT(DISTINCT user_id) AS dau
FROM audit_log
WHERE timestamp >= datetime('now', :range)
  AND user_id IS NOT NULL
GROUP BY date(timestamp)
ORDER BY day ASC
```

周活 WAU:
```sql
SELECT strftime('%Y-%W', timestamp) AS week,
       COUNT(DISTINCT user_id) AS wau
FROM audit_log
WHERE timestamp >= datetime('now', '-90 days')
  AND user_id IS NOT NULL
GROUP BY strftime('%Y-%W', timestamp)
ORDER BY week ASC
```

### 3.4 Write-Intent 统计 (`/analytics/write-intent-stats`)

accept/reject 汇总:
```sql
SELECT status,
       COUNT(*) AS cnt
FROM ai_suggestions
WHERE status IN ('accepted','rejected')
  AND created_at >= datetime('now', :range)
GROUP BY status
```

拒绝原因分布 (服务层用关键词归类):
```sql
SELECT reasoning,
       COUNT(*) AS cnt
FROM ai_suggestions
WHERE status = 'rejected'
  AND created_at >= datetime('now', :range)
GROUP BY reasoning
ORDER BY cnt DESC
LIMIT 10
```

---

## 4. API 设计

Base: `/api/v1/analytics`  
认证: admin only (requireRole('admin'))  
参数: `range=7d|30d|90d` (默认 7d)

### GET /analytics/view-usage
响应:
```json
{
  "range": "7d",
  "data": [
    { "view_id": "v1", "name": "主画面", "access_count": 42 }
  ]
}
```

### GET /analytics/widget-types
响应:
```json
{
  "range": "30d",
  "data": [
    { "type": "gauge", "count": 120 },
    { "type": "label", "count": 98 }
  ]
}
```

### GET /analytics/user-activity
响应:
```json
{
  "range": "7d",
  "dau": [{ "day": "2026-05-18", "dau": 5 }],
  "wau": [{ "week": "2026-20", "wau": 8 }]
}
```

### GET /analytics/write-intent-stats
响应:
```json
{
  "range": "7d",
  "accept_count": 30,
  "reject_count": 12,
  "accept_rate": 0.714,
  "reject_reasons": [
    { "reason": "参数超限", "count": 5 },
    { "reason": "other", "count": 7 }
  ]
}
```

---

## 5. 前端页面 (`/scada2/analytics`)

4 panel 布局 (2x2 grid):
1. **View Usage** — table: view_id | name | count (降序)
2. **Widget Types** — table: type | count (降序)
3. **User Activity** — UplotChart (DAU 折线) + summary
4. **Write-Intent Stats** — accept/reject 数字 + 原因 table

顶部: date range picker (7d / 30d / 90d，默认 7d)  
admin-only guard (与 audit-log page 相同模式)

---

## 6. 文件范围

| 文件 | 说明 |
|------|------|
| `packages/data-service/src/analytics-service.ts` | 4 个 query 函数 |
| `packages/server/src/analytics-routes.ts` | 4 个 REST endpoint |
| `packages/server/src/index.ts` | 末尾 append register |
| `packages/web-ui/src/app/scada2/analytics/page.tsx` | 4-panel admin 页面 |
| `packages/data-service/src/__tests__/analytics-service.test.ts` | 6-8 单元测试 |
| `packages/server/src/__tests__/analytics-routes.test.ts` | 6-8 路由测试 |
| `packages/web-ui/src/app/scada2/analytics/__tests__/page.test.tsx` | 8-10 UI 测试 |
| `docs/analytics.md` | 指标文档 |

---

## 7. 约束

- 无新第三方 dep (UplotChart 已存在)
- 不修改任何 migration SQL / 现有 schema
- admin-only: 全 4 endpoint + 页面
- 不触碰 alert-42 / PWA-44 / Plugin-45 范围
- baseline server=252, web-ui=1157; 期望 server+8-10, web-ui+10-12
