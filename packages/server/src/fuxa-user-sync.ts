// ============================================================
// FUXA 用户单向同步 (M2 Level 3)
// ------------------------------------------------------------
// BIOCore 是 IAM 唯一真源。启动 + 每小时把 biocore.users
// (admin/engineer/operator/viewer) 同步到 FUXA 内部 users 表。
//
// FUXA 端 (只读探查, /Volumes/SSD/FUXA):
//   SQLite: <workDir>/users.fuxap.db, 表 users / roles
//   REST:   POST/DELETE /api/users (header x-access-token, admin only)
//   groups bitmask: -1/255=admin, 4=Engineer, 2=Operator, 1=Viewer
//   signin: POST /api/signin {username,password} → {data:{token}}
//
// 角色映射 (BIOCore → FUXA groups):
//   admin / engineer → 255  operator → 4  viewer → 1
//
// 限制: 密码不同步 (FUXA auth 关闭, 走 nginx + BIOCore JWT)。
//      新建时占位随机密码; 已存在不传 password 走 UPDATE 分支。
//      失败仅 warn; 不级联删除 (M3 处理)。
// ============================================================

import { randomBytes } from 'crypto';
import type { SQLiteService } from '@biocore/data-service';

const DEFAULT_FUXA_BASE_URL = 'http://localhost:1881';
const DEFAULT_RECONCILE_MS = 60 * 60 * 1000;
const SIGNIN_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 5_000;
const FUXA_GROUP_ADMIN = 255;
const FUXA_GROUP_ENGINEER = 4;
const FUXA_GROUP_VIEWER = 1;

export type BiocoreRole = 'admin' | 'engineer' | 'operator' | 'viewer';

export interface FuxaUserSyncOptions {
  fuxaBaseUrl?: string;
  enabled?: boolean;
  adminUser?: string;
  adminPassword?: string;
  sqlite: SQLiteService;
  reconcileIntervalMs?: number;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface FuxaUserSyncResult { created: number; updated: number; errors: number; }

export interface FuxaUserSync {
  syncAllUsers(): Promise<FuxaUserSyncResult>;
  syncOnUserChange(userId: string): Promise<void>;
  close(): void;
}

interface BiocoreUserRow {
  user_id: string;
  username: string;
  display_name: string | null;
  role: BiocoreRole;
  is_active: number;
}

interface FuxaUserRow { username: string; fullname?: string; groups: number; info?: string; }

function biocoreRoleToFuxaGroups(role: BiocoreRole): number {
  if (role === 'admin' || role === 'engineer') return FUXA_GROUP_ADMIN;
  if (role === 'operator') return FUXA_GROUP_ENGINEER;
  return FUXA_GROUP_VIEWER;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function createFuxaUserSync(opts: FuxaUserSyncOptions): FuxaUserSync {
  const baseUrl = (opts.fuxaBaseUrl ?? DEFAULT_FUXA_BASE_URL).replace(/\/$/, '');
  const enabled = opts.enabled ?? true;
  const adminUser = opts.adminUser ?? 'admin';
  const adminPassword = opts.adminPassword ?? '';
  const reconcileMs = opts.reconcileIntervalMs ?? DEFAULT_RECONCILE_MS;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const log = opts.logger ?? console;
  const db = opts.sqlite.getDatabase();

  let cachedToken: string | null = null;
  let reconcileTimer: NodeJS.Timeout | null = null;

  async function getAdminToken(force = false): Promise<string | null> {
    if (!force && cachedToken) return cachedToken;
    if (!adminPassword) {
      log.warn('[FUXA-Sync] 未配置 FUXA_ADMIN_PASS, 跳过同步');
      return null;
    }
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/api/signin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: adminUser, password: adminPassword }),
        },
        SIGNIN_TIMEOUT_MS,
      );
      if (!res.ok) {
        log.warn(`[FUXA-Sync] signin 失败 status=${res.status}`);
        return null;
      }
      const body = (await res.json()) as { data?: { token?: string } };
      const token = body?.data?.token ?? null;
      if (!token) {
        log.warn('[FUXA-Sync] signin 返回缺 token');
        return null;
      }
      cachedToken = token;
      return token;
    } catch (e) {
      log.warn(`[FUXA-Sync] signin 异常: ${(e as Error).message}`);
      return null;
    }
  }

  async function listFuxaUsers(token: string): Promise<FuxaUserRow[]> {
    const res = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/api/users`,
      { method: 'GET', headers: { 'x-access-token': token } },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`GET /api/users 失败 status=${res.status}`);
    const text = await res.text();
    if (!text) return [];
    try {
      const arr = JSON.parse(text) as FuxaUserRow[];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  async function upsertFuxaUser(
    token: string,
    user: BiocoreUserRow,
    existing: FuxaUserRow | undefined,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const groups = biocoreRoleToFuxaGroups(user.role);
    const fullname = user.display_name || user.username;
    const info = JSON.stringify({ start: '', languageId: 'en', source: 'biocore-sync' });
    const params: Record<string, unknown> = { username: user.username, fullname, groups, info };
    if (!existing) {
      params.password = randomBytes(24).toString('base64url');
    } else if (existing.groups === groups && (existing.fullname ?? '') === fullname) {
      return 'skipped';
    }
    const res = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/api/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': token },
        body: JSON.stringify({ params }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`POST /api/users(${user.username}) 失败 status=${res.status}`);
    return existing ? 'updated' : 'created';
  }

  function loadActiveBiocoreUsers(): BiocoreUserRow[] {
    return db
      .prepare('SELECT user_id, username, display_name, role, is_active FROM users WHERE is_active = 1')
      .all() as BiocoreUserRow[];
  }

  async function syncAllUsers(): Promise<FuxaUserSyncResult> {
    if (!enabled) return { created: 0, updated: 0, errors: 0 };
    const token = await getAdminToken();
    if (!token) return { created: 0, updated: 0, errors: 0 };

    let existing: FuxaUserRow[] = [];
    try {
      existing = await listFuxaUsers(token);
    } catch (e) {
      log.warn(`[FUXA-Sync] 列表拉取失败: ${(e as Error).message}`);
      return { created: 0, updated: 0, errors: 1 };
    }
    const existingMap = new Map<string, FuxaUserRow>();
    for (const u of existing) existingMap.set(u.username, u);

    const users = loadActiveBiocoreUsers();
    let created = 0, updated = 0, errors = 0;
    for (const u of users) {
      // 不覆盖 FUXA 自带 'admin' (本同步用它登录)
      if (u.username === 'admin') continue;
      try {
        const r = await upsertFuxaUser(token, u, existingMap.get(u.username));
        if (r === 'created') created++;
        else if (r === 'updated') updated++;
      } catch (e) {
        errors++;
        log.warn(`[FUXA-Sync] ${u.username}: ${(e as Error).message}`);
        if ((e as Error).message.includes('401')) cachedToken = null;
      }
    }
    log.info(`[FUXA-Sync] 全量: created=${created} updated=${updated} errors=${errors} total=${users.length}`);
    return { created, updated, errors };
  }

  async function syncOnUserChange(userId: string): Promise<void> {
    if (!enabled) return;
    const token = await getAdminToken();
    if (!token) return;
    const row = db
      .prepare('SELECT user_id, username, display_name, role, is_active FROM users WHERE user_id = ?')
      .get(userId) as BiocoreUserRow | undefined;
    if (!row || row.is_active !== 1 || row.username === 'admin') return;
    try {
      const existing = await listFuxaUsers(token);
      const match = existing.find((u) => u.username === row.username);
      await upsertFuxaUser(token, row, match);
    } catch (e) {
      log.warn(`[FUXA-Sync] 单用户同步 ${userId} 失败: ${(e as Error).message}`);
    }
  }

  function close(): void {
    if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null; }
  }

  if (enabled && reconcileMs > 0) {
    reconcileTimer = setInterval(() => {
      syncAllUsers().catch((e) => log.warn(`[FUXA-Sync] reconcile 异常: ${e}`));
    }, reconcileMs);
    reconcileTimer.unref?.();
  }

  return { syncAllUsers, syncOnUserChange, close };
}
