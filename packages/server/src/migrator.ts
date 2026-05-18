// ============================================================
// migrator.ts — umzug 数据库 migration runner
//
// 功能:
// 1. baseline 三重检查 — 若旧数据库已含 users + recipes + audit_logs 三张表,
//    自动把 001-baseline-schema 标记为 already-run, 不实际执行 SQL
// 2. 顺序执行所有未运行的 .sql migration 文件
// 3. 记录到 _migrations 表 (name + executed_at)
//
// 用法:
//   import { runMigrations } from './migrator';
//   await runMigrations(sqlite.getDatabase());
// ============================================================

import { Umzug } from 'umzug';
import { readFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import type Database from 'better-sqlite3';

// ── 简易 SQLite storage (umzug 内置 storage 不直接支持 better-sqlite3) ──
function sqliteStorage(db: Database.Database) {
  // 确保 _migrations 表存在
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return {
    async logMigration({ name }: { name: string }) {
      db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(name);
    },
    async unlogMigration({ name }: { name: string }) {
      db.prepare('DELETE FROM _migrations WHERE name = ?').run(name);
    },
    async executed() {
      const rows = db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[];
      return rows.map(r => r.name);
    },
  };
}

// ── baseline 三重检查 ──
function isLegacySchema(db: Database.Database): boolean {
  const required = ['users', 'recipes', 'audit_logs'];
  for (const table of required) {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!row) return false;
  }
  return true;
}

// ── 主入口 ──
export async function runMigrations(db: Database.Database, migrationsDir?: string): Promise<void> {
  const dir = migrationsDir || resolve(__dirname, '../migrations');

  // 1. 列出所有 .sql 文件 (按文件名排序保证顺序)
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  } catch (e) {
    console.error(`[Migrator] 无法读取 migrations 目录 ${dir}:`, (e as Error).message);
    throw e;
  }

  if (files.length === 0) {
    console.log('[Migrator] 没有 migration 文件');
    return;
  }

  // 2. baseline 处理: 若已是旧数据库且 _migrations 是空的, 把 001 直接标记 already-run
  const storage = sqliteStorage(db);
  const executed = await storage.executed();
  if (isLegacySchema(db) && executed.length === 0) {
    const baseline = files.find(f => f.startsWith('001'));
    if (baseline) {
      const baselineName = basename(baseline, '.sql');
      await storage.logMigration({ name: baselineName });
      console.log(`[Migrator] 检测到旧数据库 (users+recipes+audit_logs 已存在), baseline ${baselineName} 标记为 already-run`);
    }
  }

  // 3. 构造 umzug migrations 数组
  const migrations = files.map(file => {
    const name = basename(file, '.sql');
    return {
      name,
      up: async () => {
        const sql = readFileSync(resolve(dir, file), 'utf8');
        try {
          db.exec(sql);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          // SQLite ALTER TABLE ADD COLUMN 无 IF NOT EXISTS — 重跑同一 migration 会报
          // "duplicate column name: <col>". 视为幂等成功 (列已存在即目标达成).
          if (msg.includes('duplicate column name')) {
            console.warn(`[Migrator] ${name}: duplicate column name — column 已存在, 跳过 (idempotent)`);
            return;
          }
          throw e;
        }
      },
      down: async () => {
        throw new Error(`Migration ${name} 不支持回滚 (向前迁移策略)`);
      },
    };
  });

  // 4. 跑 umzug
  const umzug = new Umzug({
    migrations,
    storage,
    logger: undefined, // 静默 umzug 自身日志, 我们用 console.log 控制
    context: db,
  });

  const pending = await umzug.pending();
  if (pending.length === 0) {
    console.log(`[Migrator] 所有 ${files.length} 个 migration 已是最新`);
    return;
  }

  console.log(`[Migrator] 待执行 ${pending.length} 个 migration: ${pending.map(p => p.name).join(', ')}`);
  await umzug.up();
  console.log(`[Migrator] ✓ ${pending.length} 个 migration 执行成功`);
}
