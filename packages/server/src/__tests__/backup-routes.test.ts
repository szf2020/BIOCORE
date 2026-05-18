// ============================================================
// backup-routes.test.ts — SP-FX-20 TDD RED-first
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { registerBackupRoutes, getRepoRoot } from '../backup-routes';

// SQLite magic header (前 16 字节)
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');

function makeApp(dataDir: string, role: 'admin' | 'engineer' | null = 'admin') {
  const app = express();
  app.use(express.json());
  // 测试绕过 authMiddleware，手动注入 user
  app.use((req, _res, next) => {
    if (role) (req as any).user = { user_id: 'test-user', role };
    next();
  });
  const router = express.Router();
  registerBackupRoutes(router, { dataDir });
  app.use('/api/v1', router);
  return app;
}

describe('GET /admin/backups (SP-FX-20)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sp-fx-20-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'backups'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('空目录返回空数组', async () => {
    const app = makeApp(tmpDir);
    const res = await request(app).get('/api/v1/admin/backups');
    expect(res.status).toBe(200);
    expect(res.body.backups).toEqual([]);
  });

  it('列出 .sqlite 和 .db.gz 文件含 size/mtime', async () => {
    const backupDir = join(tmpDir, 'backups');
    writeFileSync(join(backupDir, 'biocore-20260518.sqlite'), 'fake');
    writeFileSync(join(backupDir, 'biocore-20260517.db.gz'), 'fakegz');
    const app = makeApp(tmpDir);
    const res = await request(app).get('/api/v1/admin/backups');
    expect(res.status).toBe(200);
    expect(res.body.backups).toHaveLength(2);
    const filenames = res.body.backups.map((b: any) => b.filename).sort();
    expect(filenames).toContain('biocore-20260517.db.gz');
    expect(filenames).toContain('biocore-20260518.sqlite');
    // 每项含 size 和 mtime
    expect(typeof res.body.backups[0].size).toBe('number');
    expect(typeof res.body.backups[0].mtime).toBe('string');
  });

  it('非 admin 返回 403', async () => {
    const app = makeApp(tmpDir, 'engineer');
    const res = await request(app).get('/api/v1/admin/backups');
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/backups/:filename (SP-FX-20)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sp-fx-20-dl-${Date.now()}`);
    mkdirSync(join(tmpDir, 'backups'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('下载存在的文件，Content-Disposition 含 attachment', async () => {
    writeFileSync(join(tmpDir, 'backups', 'biocore-test.sqlite'), 'dummy content');
    const app = makeApp(tmpDir);
    const res = await request(app).get('/api/v1/admin/backups/biocore-test.sqlite');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('文件名含 path traversal → 400', async () => {
    const app = makeApp(tmpDir);
    // path traversal: 含 .. 或 /
    const res = await request(app).get('/api/v1/admin/backups/..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
  });

  it('文件不存在 → 404', async () => {
    const app = makeApp(tmpDir);
    const res = await request(app).get('/api/v1/admin/backups/nonexistent.sqlite');
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/restore (SP-FX-20)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sp-fx-20-restore-${Date.now()}`);
    mkdirSync(join(tmpDir, 'backups'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('上传非 SQLite 文件（magic bytes 错误）→ 400', async () => {
    const app = makeApp(tmpDir);
    const res = await request(app)
      .post('/api/v1/admin/restore')
      .attach('file', Buffer.from('this is not sqlite'), { filename: 'fake.sqlite', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/magic|format|SQLite/i);
  });

  it('有效 SQLite 文件上传成功', async () => {
    const Database = (await import('better-sqlite3')).default;
    const sqliteFile = join(tmpDir, 'test-restore-src.sqlite');
    const mainDbFile = join(tmpDir, 'biocore.db');
    // 创建源 DB
    const srcDb = new Database(sqliteFile);
    srcDb.exec('CREATE TABLE test_tbl (id INTEGER)');
    srcDb.close();
    // 创建目标 DB (模拟 main DB)
    const mainDb = new Database(mainDbFile);
    mainDb.exec('CREATE TABLE original_tbl (id INTEGER)');
    mainDb.close();

    const app = makeApp(tmpDir);
    const res = await request(app)
      .post('/api/v1/admin/restore')
      .attach('file', sqliteFile, { filename: 'restore.sqlite', contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('非 admin 返回 403', async () => {
    const app = makeApp(tmpDir, 'engineer');
    const res = await request(app)
      .post('/api/v1/admin/restore')
      .attach('file', Buffer.from(SQLITE_MAGIC), { filename: 'test.sqlite', contentType: 'application/octet-stream' });
    expect(res.status).toBe(403);
  });
});

// ─── KI-1 SP-FX-34: getRepoRoot() 逻辑验证 ──────────────────
// 直接测试 getRepoRoot() 纯函数，无需 mock child_process
describe('getRepoRoot (KI-1 SP-FX-34)', () => {
  afterEach(() => {
    delete process.env.BIOCORE_ROOT;
  });

  it('优先使用 BIOCORE_ROOT env', () => {
    const fakeRoot = '/fake/repo/root';
    process.env.BIOCORE_ROOT = fakeRoot;
    expect(getRepoRoot()).toBe(fakeRoot);
  });

  it('fallback = resolve(__dirname, ../../..) 指向 repo root', () => {
    delete process.env.BIOCORE_ROOT;
    const result = getRepoRoot();
    // backup-routes.ts __dirname = packages/server/src → ../../.. = repo root
    // 验证 result 不含 /packages/server/src 路径
    expect(result).not.toContain('packages/server/src');
    // 验证 result 是实际 biocore repo root 路径
    expect(result).toMatch(/biocore-sp-fx-17$/);
  });

  it('BIOCORE_ROOT 未设置时 fallback 为绝对路径', () => {
    delete process.env.BIOCORE_ROOT;
    const result = getRepoRoot();
    expect(result.startsWith('/')).toBe(true);
  });
});
