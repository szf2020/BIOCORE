// ============================================================
// backup-scheduler.test.ts — SP-FX-39 TDD RED-first
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── mock child_process.spawn (不真跑 backup-db.sh) ──────────
// 同步调用 close(0)，确保 Promise 在微任务中立即 resolve，不受 fake timer 影响
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(() => ({
      stderr: { on: vi.fn() },
      on(event: string, cb: (code: number) => void) {
        if (event === 'close') {
          // 使用 queueMicrotask 而非 setTimeout，确保 fake timer 不干扰
          queueMicrotask(() => cb(0));
        }
      },
    })),
  };
});

import { BackupScheduler } from '../services/backup-scheduler';

// ─── 辅助：在 backupDir 创建伪备份文件 ────────────────────────
function createFakeBackup(dir: string, filename: string, daysAgo: number): void {
  const filePath = join(dir, filename);
  writeFileSync(filePath, `fake backup ${filename}`);
  const mtime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  utimesSync(filePath, mtime, mtime);
}

describe('BackupScheduler — 基础状态 (SP-FX-39)', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sp-fx-39-sched-${Date.now()}`);
    backupDir = join(tmpDir, 'backups');
    mkdirSync(backupDir, { recursive: true });
    // 不用 fake timers: setInterval + Promise 在 fake timer 下行为复杂
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('初始状态: enabled=false, lastRunAt=null, nextRunAt=null', () => {
    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });
    const state = scheduler.getState();
    expect(state.enabled).toBe(false);
    expect(state.lastRunAt).toBeNull();
    expect(state.nextRunAt).toBeNull();
    expect(state.intervalHours).toBe(24);
    expect(state.retentionDays).toBe(30);
  });

  it('start() 后 enabled=true, lastRunAt 和 nextRunAt 有值', async () => {
    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });
    scheduler.start();
    // 等待初始 runOnce (spawn mock 用 queueMicrotask，再有 .then)
    // 用 real setTimeout 等待微任务完成
    await new Promise<void>(r => { setTimeout(r, 50); });
    const state = scheduler.getState();
    expect(state.enabled).toBe(true);
    expect(state.lastRunAt).not.toBeNull();
    expect(state.nextRunAt).not.toBeNull();
    scheduler.stop();
  });

  it('stop() 后 enabled=false', async () => {
    const scheduler = new BackupScheduler({
      intervalHours: 6,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });
    scheduler.start();
    await new Promise<void>(r => { setTimeout(r, 50); });
    scheduler.stop();
    expect(scheduler.getState().enabled).toBe(false);
  });

  it('updateConfig 更新 intervalHours 和 retentionDays', async () => {
    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });
    scheduler.start();
    await new Promise<void>(r => { setTimeout(r, 50); });
    scheduler.updateConfig({ intervalHours: 12, retentionDays: 14 });
    const state = scheduler.getState();
    expect(state.intervalHours).toBe(12);
    expect(state.retentionDays).toBe(14);
    scheduler.stop();
  });

  it('runOnce 两次 → 第二次 lastRunAt 晚于第一次', async () => {
    const scheduler = new BackupScheduler({
      intervalHours: 1,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });
    await scheduler.runOnce();
    const firstRun = scheduler.getState().lastRunAt;
    expect(firstRun).not.toBeNull();

    // 等 2ms 确保时间戳不同
    await new Promise<void>(r => { setTimeout(r, 2); });
    await scheduler.runOnce();
    const secondRun = scheduler.getState().lastRunAt;
    expect(secondRun).not.toBe(firstRun);
    // secondRun > firstRun
    expect(new Date(secondRun!).getTime()).toBeGreaterThan(new Date(firstRun!).getTime());
    scheduler.stop();
  });
});

describe('BackupScheduler — Retention Policy (SP-FX-39)', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sp-fx-39-retention-${Date.now()}`);
    backupDir = join(tmpDir, 'backups');
    mkdirSync(backupDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retention prune: 删除超过 retentionDays 且超过 minKeepCount 的旧文件', async () => {
    // 创建 7 个文件: 2 新 (1天, 2天) + 5 旧 (35天+)
    createFakeBackup(backupDir, 'new-1.sqlite', 1);
    createFakeBackup(backupDir, 'new-2.sqlite', 2);
    createFakeBackup(backupDir, 'old-35a.sqlite', 35);
    createFakeBackup(backupDir, 'old-35b.sqlite', 36);
    createFakeBackup(backupDir, 'old-35c.sqlite', 37);
    createFakeBackup(backupDir, 'old-35d.sqlite', 38);
    createFakeBackup(backupDir, 'old-35e.sqlite', 39);

    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 3,
      backupDir,
      dataDir: tmpDir,
    });

    await scheduler.runOnce();

    // minKeep=3, 保留 top-3 newest: new-1, new-2, old-35a → 删除 old-35b,c,d,e
    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(backupDir);
    expect(remaining.length).toBe(3);
    const names = remaining.sort();
    expect(names).toContain('new-1.sqlite');
    expect(names).toContain('new-2.sqlite');
    expect(names).toContain('old-35a.sqlite');
  });

  it('retention prune: 全部文件都新 → 不删除任何文件', async () => {
    createFakeBackup(backupDir, 'recent-1.sqlite', 1);
    createFakeBackup(backupDir, 'recent-2.sqlite', 2);
    createFakeBackup(backupDir, 'recent-3.sqlite', 3);

    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });

    await scheduler.runOnce();

    const { readdirSync } = await import('node:fs');
    expect(readdirSync(backupDir).length).toBe(3);
  });

  it('retention prune: 旧文件数量 <= minKeepCount → 全部保留', async () => {
    createFakeBackup(backupDir, 'very-old-1.sqlite', 60);
    createFakeBackup(backupDir, 'very-old-2.sqlite', 70);

    const scheduler = new BackupScheduler({
      intervalHours: 24,
      retentionDays: 30,
      minKeepCount: 5,
      backupDir,
      dataDir: tmpDir,
    });

    await scheduler.runOnce();

    const { readdirSync } = await import('node:fs');
    // 只有2个文件，minKeep=5 → 全部保留
    expect(readdirSync(backupDir).length).toBe(2);
  });
});

describe('BackupScheduler — S3 stub env check (SP-FX-39)', () => {
  afterEach(() => {
    delete process.env.BACKUP_S3_ENDPOINT;
    delete process.env.BACKUP_S3_BUCKET;
  });

  it('S3 env 未设置 → 构造不 throw', () => {
    delete process.env.BACKUP_S3_ENDPOINT;
    expect(() => {
      const s = new BackupScheduler({
        intervalHours: 24,
        retentionDays: 30,
        minKeepCount: 5,
        backupDir: tmpdir(),
        dataDir: tmpdir(),
      });
      s.stop();
    }).not.toThrow();
  });

  it('S3 env 存在 → 构造不 throw (仅 stub log)', () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://s3.example.com';
    process.env.BACKUP_S3_BUCKET = 'biocore-backups';
    expect(() => {
      const s = new BackupScheduler({
        intervalHours: 24,
        retentionDays: 30,
        minKeepCount: 5,
        backupDir: tmpdir(),
        dataDir: tmpdir(),
      });
      s.stop();
    }).not.toThrow();
  });
});
