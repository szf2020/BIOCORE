// ============================================================
// audit-log-service.ts — 审计日志 CRUD (SP-FX-19)
// ============================================================

import type Database from 'better-sqlite3';

export interface AuditLogEntry {
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: string | null;
  ip: string | null;
}

export interface AuditLogRow extends AuditLogEntry {
  id: number;
  timestamp: string;
}

export interface AuditLogQuery {
  userId?: string;
  resourceType?: string;
  limit: number;
  offset: number;
}

/**
 * 插入一条审计日志记录.
 * 写失败时抛出，由调用方决定是否忽略（middleware 层 catch）.
 */
export function insertAuditLog(db: Database.Database, entry: AuditLogEntry): void {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip)
    VALUES (@user_id, @action, @resource_type, @resource_id, @payload, @ip)
  `).run(entry);
}

/**
 * 查询审计日志.
 * 支持按 userId / resourceType 过滤, 按 timestamp DESC 排序.
 */
export function queryAuditLog(db: Database.Database, query: AuditLogQuery): AuditLogRow[] {
  const { userId, resourceType, limit, offset } = query;

  const conditions: string[] = [];
  const params: Record<string, string | number> = { limit, offset };

  if (userId) {
    conditions.push('user_id = @userId');
    params.userId = userId;
  }
  if (resourceType) {
    conditions.push('resource_type = @resourceType');
    params.resourceType = resourceType;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id, user_id, action, resource_type, resource_id, payload, ip, timestamp
    FROM audit_log
    ${where}
    ORDER BY timestamp DESC
    LIMIT @limit OFFSET @offset
  `;

  return db.prepare(sql).all(params) as AuditLogRow[];
}
