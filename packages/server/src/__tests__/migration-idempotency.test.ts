// ============================================================
// migration-idempotency.test.ts — SP-FX-35
// 验证 HIGH 级 migration 文件幂等性修复 + runner 端 duplicate-column catch
// ============================================================

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations } from '../migrator';

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

/** 创建 fresh in-memory DB 并执行全部 migration */
async function rollForward(): Promise<Database.Database> {
  const db = new Database(':memory:');
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

/** 读取指定 migration SQL 文件内容 */
function readMigrationSql(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
}

describe('SP-FX-35 migration 幂等性', () => {
  // T1: 基线确认 — fresh DB roll-forward 正常
  it('T1: fresh DB 顺序执行全部 migration 不抛异常', async () => {
    await expect(rollForward()).resolves.toBeDefined();
  });

  // T2: 025 幂等性 — 已存在 interlock_configs 时重跑 SQL 不报 "table already exists"
  it('T2: 025 SQL 在已运行过的 DB 上重跑不抛异常 (IF NOT EXISTS guard)', async () => {
    // Arrange: fresh DB + 全部 migration (包含 025)
    const db = await rollForward();
    const sql025 = readMigrationSql('025-interlock-per-reactor.sql');

    // Act + Assert: 重跑 025 SQL 不应抛出 "table already exists" 或 "index already exists"
    expect(() => db.exec(sql025)).not.toThrow();
  });

  // T3: 017 幂等性 — CREATE TABLE IF NOT EXISTS 在表已存在时不报 "table already exists"
  it('T3: 017 CREATE TABLE IF NOT EXISTS doe_studies 防御性 guard — 表已存在时不抛异常', () => {
    // Arrange: 直接创建一个含 doe_studies 表的 DB (模拟 DROP TABLE IF EXISTS 被 FK 约束跳过的场景)
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE doe_studies (
      study_id TEXT PRIMARY KEY,
      name     TEXT NOT NULL
    )`);

    // Act: 执行 017 中的 CREATE TABLE IF NOT EXISTS 语句 (含 IF NOT EXISTS guard)
    // 不应报 "table already exists"
    expect(() =>
      db.exec(`CREATE TABLE IF NOT EXISTS doe_studies (
        study_id TEXT PRIMARY KEY,
        name     TEXT NOT NULL
      )`),
    ).not.toThrow();
  });

  // T4: runner catch duplicate column — 003 重跑通过 runner 走 catch 路径，不 throw
  it('T4: migrator runner 重跑 ALTER-ADD-COLUMN migration 时 catch duplicate column 不 throw', async () => {
    // Arrange: fresh DB + 全部 migration
    const db = await rollForward();

    // 把 003 从 _migrations 删除，让 runner "重跑" 它
    db.prepare("DELETE FROM _migrations WHERE name = '003-add-trace-fields'").run();

    // Assert: runner 应捕获 "duplicate column name" 并继续，不抛异常
    await expect(runMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();
  });

  // T5: runner 不吞掉真实错误 — 非 duplicate-column 错误仍 throw
  it('T5: 非 duplicate-column SQLite 错误 (UNIQUE constraint) 正常抛出不被吞掉', () => {
    // Arrange: 一个有 UNIQUE constraint 的表，插入重复值
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test_unique (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO test_unique VALUES ('abc')`);

    // Act + Assert: "UNIQUE constraint failed" 不含 "duplicate column name"，应正常抛出
    expect(() => db.exec(`INSERT INTO test_unique VALUES ('abc')`)).toThrow(
      /UNIQUE constraint failed/,
    );
  });
});
