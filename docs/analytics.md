# BIOCore Analytics — 使用度量指南

版本: 1.0 (SP-FX-43)  
日期: 2026-05-18

---

## 概述

Analytics Dashboard 提供 4 类业务使用度量，直接聚合现有表，无需新建数据表。  
所有接口均为 **admin only**，通过 `/scada2/analytics` 页面访问。

---

## 指标定义

### 1. View Usage — 画面访问次数排名

**数据来源**: `audit_log` 表  
**筛选条件**: `resource_type IN ('scada', 'views')`  
**聚合方式**: 按 `resource_id` 分组，计数排序

| 字段 | 类型 | 说明 |
|------|------|------|
| view_id | string | 画面 ID (即 resource_id) |
| access_count | number | 时间范围内访问次数 |

**SQL 模板**:
```sql
SELECT resource_id AS view_id,
       COUNT(*) AS access_count
FROM audit_log
WHERE resource_type IN ('scada', 'views')
  AND timestamp >= datetime('now', '-7 days')
  AND resource_id IS NOT NULL
GROUP BY resource_id
ORDER BY access_count DESC
LIMIT 20
```

---

### 2. Widget Types — 组件类型使用频次

**数据来源**: `scada_views.items_json` + `fuxa_views.payload`  
**解析方式**: JS 层解析 JSON，统计 `type` 字段频次

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | Widget 类型名称 (e.g. 'gauge', 'label') |
| count | number | 出现次数 (两表合并) |

**scada_views JSON 结构**:
```json
{
  "widget-id-1": { "type": "gauge", "x": 100, "y": 200 },
  "widget-id-2": { "type": "label" }
}
```

**fuxa_views payload 结构**:
```json
{
  "items": [
    { "type": "button", "name": "start" },
    { "type": "gauge" }
  ]
}
```

---

### 3. User Activity — 用户活跃度

**数据来源**: `audit_log` 表  
**注意**: `user_id IS NULL` 的记录不计入（未认证操作）

| 字段 | 类型 | 说明 |
|------|------|------|
| dau[].day | string | 日期 (YYYY-MM-DD) |
| dau[].dau | number | 当天活跃用户数 (user_id 去重) |
| wau[].week | string | 周标识 (YYYY-WW) |
| wau[].wau | number | 当周活跃用户数 (user_id 去重) |

**DAU SQL**:
```sql
SELECT date(timestamp) AS day,
       COUNT(DISTINCT user_id) AS dau
FROM audit_log
WHERE timestamp >= datetime('now', '-7 days')
  AND user_id IS NOT NULL
GROUP BY date(timestamp)
ORDER BY day ASC
```

**WAU SQL** (固定 90 天窗口):
```sql
SELECT strftime('%Y-%W', timestamp) AS week,
       COUNT(DISTINCT user_id) AS wau
FROM audit_log
WHERE timestamp >= datetime('now', '-90 days')
  AND user_id IS NOT NULL
GROUP BY strftime('%Y-%W', timestamp)
ORDER BY week ASC
```

---

### 4. Write-Intent Stats — AI 建议接受/拒绝统计

**数据来源**: `ai_suggestions` 表  
**筛选条件**: `status IN ('accepted', 'rejected')`

| 字段 | 类型 | 说明 |
|------|------|------|
| accept_count | number | 已接受建议数 |
| reject_count | number | 已拒绝建议数 |
| accept_rate | number | accept_count / (accept + reject)，范围 [0, 1] |
| reject_reasons[].reason | string | 拒绝原因 (来自 `reasoning` 字段，NULL 归入 'other') |
| reject_reasons[].count | number | 该原因出现次数 |

**SQL 模板**:
```sql
-- accept/reject 汇总
SELECT status, COUNT(*) AS cnt
FROM ai_suggestions
WHERE status IN ('accepted', 'rejected')
  AND created_at >= datetime('now', '-7 days')
GROUP BY status

-- 拒绝原因分布
SELECT COALESCE(NULLIF(TRIM(reasoning), ''), 'other') AS reason,
       COUNT(*) AS cnt
FROM ai_suggestions
WHERE status = 'rejected'
  AND created_at >= datetime('now', '-7 days')
GROUP BY reason
ORDER BY cnt DESC
LIMIT 10
```

---

## API 接口

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/analytics/view-usage` | 画面访问排名 |
| GET | `/api/v1/analytics/widget-types` | Widget 类型频次 |
| GET | `/api/v1/analytics/user-activity` | DAU/WAU 统计 |
| GET | `/api/v1/analytics/write-intent-stats` | AI 建议统计 |

### 公共参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| range | string | 7d | 时间范围: `7d`, `30d`, `90d` |

### 认证

所有端点需要 `role=admin` JWT 令牌。非 admin 返回 403。

### 响应示例

```bash
curl -H "Authorization: Bearer <admin-token>" \
  "http://localhost:3001/api/v1/analytics/view-usage?range=7d"
```

```json
{
  "range": "7d",
  "data": [
    { "view_id": "main-view", "access_count": 42 },
    { "view_id": "reactor-1", "access_count": 18 }
  ]
}
```

---

## 前端页面

路径: `/scada2/analytics`  
访问要求: admin role

4 panel 布局 (2x2 grid):
- 左上: View Usage — 访问排名 table
- 右上: Widget Types — 组件频次 table
- 左下: User Activity — DAU 柱状图 + WAU summary
- 右下: Write-Intent Stats — accept/reject 数字 + 原因 table

顶部 date range picker 统一控制所有 panel 的时间范围。

---

## 扩展指南

### 新增指标步骤

1. 在 `packages/data-service/src/analytics-service.ts` 添加新的 query 函数并 export
2. 在 `packages/data-service/src/index.ts` re-export 新函数
3. 在 `packages/server/src/analytics-routes.ts` 添加对应 GET endpoint
4. 在 `packages/web-ui/src/app/scada2/analytics/page.tsx` 添加新 panel 组件
5. 在本文档补充指标定义

### 常见扩展场景

| 指标 | 数据来源 | 方向 |
|------|----------|------|
| 批次成功率 | `batches.status` | 按 reactor 分组统计 |
| 报警频次 | `alarm_history` | 按 alarm_id 排名 |
| API 响应时间 | metrics (SP-FX-28) | P95/P99 分位数 |
| 配方使用率 | `batches.recipe_id` | 最热配方排名 |
| 用户登录频率 | `audit_log WHERE action='POST' AND resource_type='auth'` | 按用户统计 |

### 性能注意

- 所有 query 基于 SQLite，利用现有索引 (`idx_audit_log_user_ts`, `idx_audit_log_resource_ts`)
- 大数据量时考虑在 analytics-service.ts 中加缓存层或 LIMIT 约束
- widget-type 统计需要 JS 层解析 JSON，极大 payload 时注意内存占用
