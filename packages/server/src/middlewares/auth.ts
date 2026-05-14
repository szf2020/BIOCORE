// ============================================================
// auth.ts — 统一认证中间件
//
// 支持两种凭证:
// 1. API Key (X-API-Key: ak_xxx.xxx) — 给 MES/外部系统用, 优先级更高
// 2. JWT (Authorization: Bearer xxx) — 给前端 UI 用
//
// API Key 格式: ak_{8字节hex}.{32字节base64url}
// 存储: api_keys 表 含 key_id (公开) + salt + sha256(salt+rawKey)
// ============================================================

import type { Request, RequestHandler, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import type Database from 'better-sqlite3';

// router 内部路径 (不带 /api 前缀)
// v1.7.3 安全收紧:
//   - 移除 /ai/report 和 /admin/metrics (H1+H2: 不应公开)
//   - 改为精确匹配 (req.path === p), 防止前缀绕过
//   - 仅 swagger UI 需要子路径 (CSS/JS), 单独走 DOCS_PUBLIC_PREFIXES
export const PUBLIC_PATHS = ['/auth/login', '/status', '/docs.json', '/admin/health/liveness'];

// 仅这些前缀仍按 startsWith 匹配 (swagger-ui-express 提供 /docs, /docs/swagger-ui.css 等)
export const DOCS_PUBLIC_PREFIXES = ['/docs'];

const JWT_SECRET = process.env.JWT_SECRET || 'biocore-dev-secret-change-in-production';
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

// P1 修复: 使用 timingSafeEqual 防止时序攻击
function safeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyJWT(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    // P2 修复: 严格校验 JWT 格式
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = createHash('sha256').update(`${header}.${body}.${JWT_SECRET}`).digest('base64url');
    // P1 修复: 防时序攻击
    if (!safeStringCompare(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    // 注: exp 存储为毫秒 Date.now() + JWT_EXPIRY_MS, 所以直接与 Date.now() 对比
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function hashApiKey(rawKey: string, salt: string): string {
  return createHash('sha256').update(salt + rawKey).digest('hex');
}

// 持有 SQLite 引用的工厂函数 (避免循环依赖)
let dbRef: Database.Database | null = null;
export function setAuthDb(db: Database.Database): void {
  dbRef = db;
}

function verifyApiKey(apiKey: string): { keyId: string; scopes: string[] } | null {
  if (!dbRef) return null;
  // 格式: ak_xxx.rawKey
  const dotIdx = apiKey.indexOf('.');
  if (dotIdx < 0) return null;
  const keyId = apiKey.slice(0, dotIdx);
  const rawKey = apiKey.slice(dotIdx + 1);
  if (!keyId.startsWith('ak_') || !rawKey) return null;

  const row: any = dbRef.prepare(
    'SELECT key_hash, salt, scopes FROM api_keys WHERE key_id = ? AND revoked = 0'
  ).get(keyId);
  if (!row) return null;

  const computedHash = hashApiKey(rawKey, row.salt);
  if (computedHash !== row.key_hash) return null;

  // 更新 last_used_at (异步, 不阻塞)
  try {
    dbRef.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE key_id = ?').run(keyId);
  } catch { /* ignore */ }

  return { keyId, scopes: (row.scopes || '').split(/\s+/).filter(Boolean) };
}

export function authMiddleware(req: any, res: Response, next: NextFunction): void {
  // 公开路径直接放行 (v1.7.3: 精确匹配, 防前缀绕过)
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }
  // swagger UI 子路径 (e.g. /docs/swagger-ui.css) 仍走前缀
  if (DOCS_PUBLIC_PREFIXES.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

  // AUTH_ENABLED=false 表示开发模式, 跳过所有鉴权
  // 生产部署必须设置 AUTH_ENABLED=true (默认)
  if (!AUTH_ENABLED) {
    req.user = { user_id: 'admin-001', username: 'admin', role: 'admin' };
    return next();
  }

  // 1. 优先检查 X-API-Key (供 MES/外部系统使用)
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader) {
    const result = verifyApiKey(apiKeyHeader);
    if (!result) {
      res.status(401).json({ error: 'API Key 无效或已撤销' });
      return;
    }
    req.user = {
      user_id: `apikey:${result.keyId}`,
      username: result.keyId,
      display_name: result.keyId,
      role: 'service',
      scopes: result.scopes,
    };
    return next();
  }

  // 2. 否则用 JWT Bearer token (供前端 UI 使用) 或 cookie (W3 nginx auth_request SSO)
  // P0 修复: 无 token 时必须返回 401, 不再回退到 admin 身份
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // W3: 从 cookie biocore_token 读取 (iframe 跨页无法加 header)
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)biocore_token=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (!token) {
    res.status(401).json({ error: '未授权: 请提供 Authorization Bearer token / X-API-Key / Cookie biocore_token' });
    return;
  }

  const payload = verifyJWT(token);
  if (!payload) {
    res.status(401).json({ error: 'Token 无效或已过期' });
    return;
  }
  req.user = payload;
  next();
}

// ============================================================
// requireRole — role-based access control middleware factory
// (v1.7.3 P0)
//
// 用法:
//   apiRouter.post('/users', requireRole('admin'), handler);
//   apiRouter.post('/reactors/:id/start',
//     requireRole('admin', 'engineer', 'operator', 'service'),
//     handler);
//
// 行为:
// - !req.user                                → 401 Unauthorized
// - req.user.role === 'admin'                → 通过 (admin 拥有全部权限)
// - !allowedRoles.includes(req.user.role)    → 403 Forbidden
// - 其余                                     → next()
//
// 重要: API Key 在 authMiddleware 中被赋予 role='service'。
// 'service' 必须显式出现在 allowedRoles 中才放行 —— 例如
// requireRole('admin') 会拒绝 service 角色的 API Key。
// ============================================================
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (req: any, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: '未授权: 缺少身份信息' });
      return;
    }
    const role = req.user.role;
    // admin > everything
    if (role === 'admin') {
      return next();
    }
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ error: `Forbidden: requires role ${allowedRoles.join('|')}` });
      return;
    }
    next();
  };
}
