// ============================================================
// view-acl.ts — 视图级 ACL 访问控制中间件 (SP-FX-24)
// ============================================================
// enforceViewAccess: 检查当前用户是否有权访问指定 viewId
//
// 访问规则 (OR 关系):
//   1. user.role === 'admin'            → 无条件通过
//   2. view.owner_id === user.user_id   → owner 通过
//   3. user.user_id 在 acl.users 中    → 通过
//   4. user.role 在 acl.roles 中       → 通过
//   否则 → 403
// ============================================================

import type { RequestHandler } from 'express';
import type { SQLiteService, ScadaViewAcl } from '@biocore/data-service';

function parseAcl(raw: string | undefined): ScadaViewAcl {
  if (!raw) return { users: [], roles: ['admin', 'operator'] };
  try {
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    };
  } catch {
    return { users: [], roles: ['admin', 'operator'] };
  }
}

export function enforceViewAccess(sqlite: SQLiteService): RequestHandler {
  return (req, res, next) => {
    const user = (req as any).user as { user_id: string; role: string } | undefined;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const viewId = req.params.viewId;
    if (!viewId) {
      res.status(400).json({ error: 'viewId_required' });
      return;
    }

    const view = sqlite.getScadaView(viewId);
    if (!view) {
      res.status(404).json({ error: 'view_not_found' });
      return;
    }

    // admin 永远 bypass (view 存在时)
    if (user.role === 'admin') {
      next();
      return;
    }

    // 检查 owner
    if (view.owner_id && view.owner_id === user.user_id) {
      next();
      return;
    }

    // 检查 acl.users / acl.roles
    const acl = parseAcl(view.acl);
    if (acl.users.includes(user.user_id) || acl.roles.includes(user.role)) {
      next();
      return;
    }

    res.status(403).json({ error: 'forbidden' });
  };
}
