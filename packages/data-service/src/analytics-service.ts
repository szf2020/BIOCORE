// ============================================================
// analytics-service.ts — Analytics 聚合查询 (SP-FX-43)
// ============================================================
// 直接 query 现有表: audit_log, scada_views, fuxa_views, ai_suggestions.
// 不新建 table. 全部 read-only.
// ============================================================

import type Database from 'better-sqlite3';

// ── 类型定义 ────────────────────────────────────────────────

export interface ViewUsageRow {
  view_id: string;
  access_count: number;
}

export interface WidgetTypeRow {
  type: string;
  count: number;
}

export interface DauRow {
  day: string;
  dau: number;
}

export interface WauRow {
  week: string;
  wau: number;
}

export interface UserActivityResult {
  dau: DauRow[];
  wau: WauRow[];
}

export interface RejectReasonRow {
  reason: string;
  count: number;
}

export interface WriteIntentStatsResult {
  accept_count: number;
  reject_count: number;
  accept_rate: number;
  reject_reasons: RejectReasonRow[];
}

// ── range 参数解析 ──────────────────────────────────────────

const VALID_RANGES: Record<string, string> = {
  '7d': '-7 days',
  '30d': '-30 days',
  '90d': '-90 days',
};

/**
 * 将 "7d"/"30d"/"90d" 转为 SQLite datetime() 偏移字符串.
 * 非法值返回 '-7 days' (default).
 */
export function parseRangeToDays(range: string): string {
  return VALID_RANGES[range] ?? '-7 days';
}

// ── queryViewUsage ──────────────────────────────────────────

/**
 * 统计 audit_log 中 scada/views resource_type 的访问次数排名.
 * @param range SQLite datetime offset, e.g. '-7 days'
 */
export function queryViewUsage(
  db: Database.Database,
  range: string,
): ViewUsageRow[] {
  const sql = `
    SELECT resource_id AS view_id,
           COUNT(*) AS access_count
    FROM audit_log
    WHERE resource_type IN ('scada', 'views')
      AND timestamp >= datetime('now', @range)
      AND resource_id IS NOT NULL
    GROUP BY resource_id
    ORDER BY access_count DESC
    LIMIT 20
  `;
  return db.prepare(sql).all({ range }) as ViewUsageRow[];
}

// ── queryWidgetTypes ────────────────────────────────────────

/**
 * 解析 scada_views.items_json 和 fuxa_views.payload 中的 widget type.
 * 在 JS 层做 JSON 解析和频次合并.
 * @param range SQLite datetime offset, e.g. '-30 days'
 */
export function queryWidgetTypes(
  db: Database.Database,
  range: string,
): WidgetTypeRow[] {
  const typeCounts = new Map<string, number>();

  // scada_views: items_json = { widgetId: { type: string } }
  const scadaRows = db.prepare(`
    SELECT items_json FROM scada_views
    WHERE updated_at >= datetime('now', @range)
  `).all({ range }) as Array<{ items_json: string }>;

  for (const row of scadaRows) {
    try {
      const items = JSON.parse(row.items_json) as Record<string, unknown>;
      for (const item of Object.values(items)) {
        if (item && typeof item === 'object' && 'type' in item) {
          const t = (item as Record<string, unknown>).type;
          if (typeof t === 'string') {
            typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
          }
        }
      }
    } catch {
      // JSON parse 失败则跳过
    }
  }

  // fuxa_views: payload = { items: [{ type: string }] }
  const fuxaRows = db.prepare(`
    SELECT payload FROM fuxa_views
    WHERE updated_at >= datetime('now', @range)
      AND is_template = 0
      AND type = 'svg'
  `).all({ range }) as Array<{ payload: string }>;

  for (const row of fuxaRows) {
    try {
      const parsed = JSON.parse(row.payload) as Record<string, unknown>;
      const items = parsed['items'];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && typeof item === 'object' && 'type' in item) {
            const t = (item as Record<string, unknown>).type;
            if (typeof t === 'string') {
              typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
            }
          }
        }
      }
    } catch {
      // JSON parse 失败则跳过
    }
  }

  return Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

// ── queryUserActivity ───────────────────────────────────────

/**
 * 从 audit_log 统计 DAU (按 range) 和 WAU (固定 90 天).
 * @param range SQLite datetime offset, e.g. '-7 days'
 */
export function queryUserActivity(
  db: Database.Database,
  range: string,
): UserActivityResult {
  const dau = db.prepare(`
    SELECT date(timestamp) AS day,
           COUNT(DISTINCT user_id) AS dau
    FROM audit_log
    WHERE timestamp >= datetime('now', @range)
      AND user_id IS NOT NULL
    GROUP BY date(timestamp)
    ORDER BY day ASC
  `).all({ range }) as DauRow[];

  const wau = db.prepare(`
    SELECT strftime('%Y-%W', timestamp) AS week,
           COUNT(DISTINCT user_id) AS wau
    FROM audit_log
    WHERE timestamp >= datetime('now', '-90 days')
      AND user_id IS NOT NULL
    GROUP BY strftime('%Y-%W', timestamp)
    ORDER BY week ASC
  `).all({}) as WauRow[];

  return { dau, wau };
}

// ── queryWriteIntentStats ───────────────────────────────────

/**
 * 从 ai_suggestions 统计 write-intent accept/reject 率及拒绝原因.
 * @param range SQLite datetime offset, e.g. '-7 days'
 */
export function queryWriteIntentStats(
  db: Database.Database,
  range: string,
): WriteIntentStatsResult {
  const statusRows = db.prepare(`
    SELECT status,
           COUNT(*) AS cnt
    FROM ai_suggestions
    WHERE status IN ('accepted', 'rejected')
      AND created_at >= datetime('now', @range)
    GROUP BY status
  `).all({ range }) as Array<{ status: string; cnt: number }>;

  let accept_count = 0;
  let reject_count = 0;
  for (const row of statusRows) {
    if (row.status === 'accepted') accept_count = row.cnt;
    if (row.status === 'rejected') reject_count = row.cnt;
  }
  const total = accept_count + reject_count;
  const accept_rate = total > 0 ? accept_count / total : 0;

  const reasonRows = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(reasoning), ''), 'other') AS reason,
           COUNT(*) AS cnt
    FROM ai_suggestions
    WHERE status = 'rejected'
      AND created_at >= datetime('now', @range)
    GROUP BY reason
    ORDER BY cnt DESC
    LIMIT 10
  `).all({ range }) as Array<{ reason: string; cnt: number }>;

  const reject_reasons: RejectReasonRow[] = reasonRows.map(r => ({
    reason: r.reason,
    count: r.cnt,
  }));

  return { accept_count, reject_count, accept_rate, reject_reasons };
}
