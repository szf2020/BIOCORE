// ============================================================
// audit-log.ts — 用户操作审计中间件 (SP-FX-19)
// ============================================================
// 拦截 POST/PUT/PATCH/DELETE 请求, 写 audit_log 行.
// 跳过: GET/HEAD/OPTIONS + 健康检查 + SSE endpoint.
// 写失败不影响主请求 (静默 catch).
// ============================================================

import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SKIP_PATH_SUBSTRINGS = ['/health', '/status', '/events', '/docs'];
const MAX_PAYLOAD_BYTES = 4096;

/** 从 URL 路径提取 resource_type 和 resource_id. */
function parseResource(path: string): { resourceType: string; resourceId: string | null } {
  // path 格式: /api/v1/<resource_type>[/<resource_id>[/...]]
  const segments = path.replace(/^\/+/, '').split('/');
  // /api/v1/batches/42 → ['api', 'v1', 'batches', '42']
  const resourceType = segments[2] ?? 'unknown';
  const resourceId = segments[3] ?? null;
  return { resourceType, resourceId };
}

/**
 * 工厂函数: 注入 SQLite db, 返回 Express RequestHandler.
 * 在 authMiddleware 之后挂载可拿到 req.user.
 */
export function createAuditLogMiddleware(db: Database.Database): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 跳过安全方法
    if (SKIP_METHODS.has(req.method)) {
      next();
      return;
    }

    // 跳过健康/SSE 路径
    if (SKIP_PATH_SUBSTRINGS.some(s => req.path.includes(s))) {
      next();
      return;
    }

    try {
      const { resourceType, resourceId } = parseResource(req.path);

      // body 超限截断
      let payload: string | null = null;
      if (req.body && typeof req.body === 'object') {
        const raw = JSON.stringify(req.body);
        payload = raw.length > MAX_PAYLOAD_BYTES ? raw.slice(0, MAX_PAYLOAD_BYTES) : raw;
      }

      db.prepare(`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip)
        VALUES (@user_id, @action, @resource_type, @resource_id, @payload, @ip)
      `).run({
        user_id: (req as any).user?.sub ?? null,
        action: req.method,
        resource_type: resourceType,
        resource_id: resourceId,
        payload,
        ip: req.ip ?? null,
      });
    } catch (err) {
      // 写失败不影响主请求
      console.error('[audit-log] 写入失败:', err);
    }

    next();
  };
}
