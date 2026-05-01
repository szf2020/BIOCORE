// ============================================================
// permissions.ts — 精细 RBAC 权限中间件 (F5)
// 替代简单的 requireRole(), 支持 resource × action 粒度控制
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

interface PermEntry {
  role: string;
  resource: string;
  action: string;
  allowed: number;
}

// 内存缓存, 60s 刷新
let cache: PermEntry[] = [];
let cacheAt = 0;
const CACHE_TTL = 60_000;

function refreshCache(db: Database.Database): void {
  const now = Date.now();
  if (now - cacheAt < CACHE_TTL && cache.length > 0) return;
  cache = db.prepare('SELECT role, resource, action, allowed FROM permissions').all() as PermEntry[];
  cacheAt = now;
}

/**
 * 检查给定角色是否对 resource 有 action 权限.
 * 匹配顺序: 精确 > resource 通配符 > 全通配符
 */
function isAllowed(role: string, resource: string, action: string): boolean {
  // admin 硬编码全权 (不查表)
  if (role === 'admin') return true;

  // 精确匹配
  const exact = cache.find(p => p.role === role && p.resource === resource && p.action === action);
  if (exact) return exact.allowed === 1;

  // resource 通配: 如 'reactor:*' 匹配 'reactor:F01'
  const [resType] = resource.split(':');
  const wildRes = cache.find(p => p.role === role && p.resource === `${resType}:*` && p.action === action);
  if (wildRes) return wildRes.allowed === 1;

  // 全通配
  const wildAll = cache.find(p => p.role === role && p.resource === '*' && p.action === action);
  if (wildAll) return wildAll.allowed === 1;

  // action 全通配
  const wildAction = cache.find(p => p.role === role && p.resource === '*' && p.action === '*');
  if (wildAction) return wildAction.allowed === 1;

  return false;
}

/**
 * Express 中间件工厂 — 检查请求用户是否有指定权限
 */
export function checkPermission(db: Database.Database, resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    refreshCache(db);
    const role = (req as any).user?.role;
    if (!role) return res.status(401).json({ error: '未认证' });
    if (!isAllowed(role, resource, action)) {
      return res.status(403).json({ error: `无权限: ${action} on ${resource}` });
    }
    next();
  };
}

/**
 * CRUD 路由: 权限管理 (仅 admin 可操作)
 */
export function registerPermissionRoutes(router: any, db: Database.Database): void {
  // GET /permissions — 全部权限
  router.get('/permissions', (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可查看权限' });
    refreshCache(db);
    const rows = db.prepare('SELECT * FROM permissions ORDER BY role, resource, action').all();
    res.json(rows);
  });

  // POST /permissions — 新增或更新权限
  router.post('/permissions', (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可修改权限' });
    const { role, resource, action, allowed } = req.body || {};
    if (!role || !resource || !action) return res.status(400).json({ error: '缺少 role/resource/action' });
    db.prepare(`
      INSERT INTO permissions (role, resource, action, allowed)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(role, resource, action) DO UPDATE SET allowed = excluded.allowed
    `).run(role, resource, action, allowed ?? 1);
    cacheAt = 0; // 强制刷新缓存
    res.json({ success: true });
  });

  // DELETE /permissions/:id
  router.delete('/permissions/:id', (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可删除权限' });
    db.prepare('DELETE FROM permissions WHERE id = ?').run(req.params.id);
    cacheAt = 0;
    res.json({ success: true });
  });
}
