// ============================================================
// auth-routes.ts — 认证 + 用户管理 REST API
// ============================================================
// Extracted from index.ts (route-handler-split, post v1.12.0).
// Behavior preserving — same routes, same payloads, same audit, same
// legacy sha256→bcrypt migration on login (v1.8.0 bucket 1).
//
// Routes (mounted under /api/v1):
//   POST   /auth/login    — 登录, 返回 JWT
//   GET    /auth/me       — 当前用户 (req.user)
//   GET    /users         — 用户列表
//   POST   /users         — 创建 (admin)
//   PUT    /users/:id     — 更新 (admin) — 含改密
//   DELETE /users/:id     — 删除 (拒绝 admin-001)
//
// Helpers (createJWT, verifyPassword, hashPasswordBcrypt) are injected
// via deps because they remain shared with crash-recovery / scheduler /
// test code paths in index.ts.
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '@biocore/data-service';
import { requireRole } from './middlewares/auth';
// SP-FX-40: brute-force 防护 — login 限 5 req/min per ip:path
import { rateLimit } from './middlewares/rate-limit';

const loginRateLimit = rateLimit({ limit: 5, windowMs: 60_000, keyStrategy: 'ip:path' });

export interface AuthRoutesDeps {
  sqlite: SQLiteService;
  createJWT: (payload: Record<string, any>) => string;
  verifyPassword: (
    password: string,
    storedHash: string,
  ) => Promise<{ ok: boolean; legacy: boolean }>;
  hashPasswordBcrypt: (password: string) => Promise<string>;
}

export function registerAuthRoutes(
  apiRouter: Router,
  deps: AuthRoutesDeps,
): void {
  const { sqlite, createJWT, verifyPassword, hashPasswordBcrypt } = deps;

  // ── 认证 API ──

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     summary: 用户登录
   *     tags: [Auth]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username, password]
   *             properties:
   *               username: { type: string, example: admin }
   *               password: { type: string, example: admin123 }
   *     responses:
   *       200:
   *         description: 登录成功, 返回 JWT token
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/UnifiedResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         token: { type: string }
   *                         user:
   *                           type: object
   *                           properties:
   *                             user_id: { type: string }
   *                             username: { type: string }
   *                             display_name: { type: string }
   *                             role: { type: string, enum: [admin, engineer, operator, viewer] }
   *       401: { description: 用户名或密码错误 }
   *       400: { description: 缺少必填字段 }
   */
  apiRouter.post('/auth/login', loginRateLimit, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
    const user: any = sqlite.getDatabase().prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    const result = await verifyPassword(password, user.password_hash || '');
    if (!result.ok) return res.status(401).json({ error: '用户名或密码错误' });
    // v1.8.0 bucket 1: migrate-on-login from legacy sha256 → bcrypt
    if (result.legacy) {
      try {
        const newHash = await hashPasswordBcrypt(password);
        sqlite.getDatabase().prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(newHash, user.user_id);
        sqlite.writeAuditLog({
          user_id: user.user_id,
          action: 'password_hash_migrated',
          target_type: 'user',
          target_id: user.user_id,
          target_kind: 'user_id',
          reason: 'sha256_to_bcrypt_v1.8.0',
        });
      } catch (e) {
        console.warn(`[AUTH] failed to migrate password hash for ${user.user_id}:`, (e as Error).message);
      }
    }
    // 更新最后登录时间
    sqlite.getDatabase().prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE user_id = ?').run(user.user_id);
    const token = createJWT({ user_id: user.user_id, username: user.username, role: user.role, display_name: user.display_name });
    // W3 SSO: 同时种 httpOnly cookie, 用于 nginx auth_request 校验 FUXA iframe 访问
    // 前端现有 fetch 仍用 localStorage + Authorization header, 此 cookie 仅为跨 iframe 自动携带
    res.cookie('biocore_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });
    res.json({ token, user: { user_id: user.user_id, username: user.username, display_name: user.display_name, role: user.role } });
  });

  apiRouter.get('/auth/me', (req: any, res) => {
    res.json(req.user || null);
  });

  // W3 集成: nginx auth_request 调用. 已通过全局 auth middleware 校验 JWT/API-Key,
  // 走到此 handler 即视为已认证, 返 204 No Content (无 body, 性能高).
  // 未授权请求被全局 middleware 拦截返 401.
  apiRouter.get('/auth/verify', (_req: any, res) => {
    res.status(204).end();
  });

  // ── 用户管理 API ──

  apiRouter.get('/users', (_req: any, res) => {
    const rows = sqlite.getDatabase().prepare('SELECT user_id, username, display_name, role, created_at, last_login_at, is_active FROM users ORDER BY created_at').all();
    res.json(rows);
  });

  apiRouter.post('/users', requireRole('admin'), async (req: any, res) => {
    const { username, display_name, password, role } = req.body;
    if (!username || !password || !display_name) return res.status(400).json({ error: '缺少必填字段' });
    if (!['admin', 'engineer', 'operator', 'viewer'].includes(role)) return res.status(400).json({ error: '无效角色' });
    const existing = sqlite.getDatabase().prepare('SELECT user_id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: '用户名已存在' });
    const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const hash = await hashPasswordBcrypt(password);
    sqlite.getDatabase().prepare(`INSERT INTO users (user_id, username, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, username, display_name, hash, role);
    sqlite.writeAuditLog({ user_id: req.user?.user_id || 'system', action: 'user_create', target_type: 'user', target_id: userId, new_value: JSON.stringify({ username, role }), ip_address: req.ip || req.socket?.remoteAddress || null, trace_id: req.trace_id });
    res.json({ user_id: userId, username, display_name, role });
  });

  apiRouter.put('/users/:id', requireRole('admin'), async (req: any, res) => {
    const { display_name, role, is_active, password } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await hashPasswordBcrypt(password);
      updates.push('password_hash = ?'); params.push(hash);
    }
    if (updates.length === 0) return res.status(400).json({ error: '无更新字段' });
    params.push(req.params.id);
    sqlite.getDatabase().prepare(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    res.json({ success: true });
  });

  apiRouter.delete('/users/:id', (req: any, res) => {
    if (req.params.id === 'admin-001') return res.status(400).json({ error: '不能删除默认管理员' });
    sqlite.getDatabase().prepare('DELETE FROM users WHERE user_id = ?').run(req.params.id);
    res.json({ success: true });
  });
}
