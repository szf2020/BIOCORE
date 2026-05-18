// ============================================================
// backup-scheduler.ts — SP-FX-39 定时备份 + 保留策略
// ============================================================
// 功能:
//   - setInterval 定时调 backup-db.sh (ZERO 第三方依赖)
//   - retention prune: 删除超出 retentionDays 且超出 minKeepCount 的旧文件
//   - S3 upload stub (env 声明, 实现留 SP-FX-40+)
//
// 环境变量:
//   BACKUP_INTERVAL_HOURS   (默认 24)
//   BACKUP_RETENTION_DAYS   (默认 30)
//   BACKUP_MIN_KEEP         (默认 5)
//   BACKUP_S3_ENDPOINT      (stub, 未来 SP-FX-40)
//   BACKUP_S3_BUCKET        (stub)
//   BACKUP_S3_ACCESS_KEY    (stub)
//   BACKUP_S3_SECRET_KEY    (stub)
// ============================================================

import { readdirSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { spawn } from 'node:child_process';

// ─── 公开接口 ─────────────────────────────────────────────────

export interface SchedulerConfig {
  intervalHours: number;
  retentionDays: number;
  minKeepCount: number;
  backupDir: string;
  dataDir: string;
}

export interface SchedulerState {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

// ─── BackupScheduler ─────────────────────────────────────────

export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalHours: number;
  private retentionDays: number;
  private readonly minKeepCount: number;
  private readonly backupDir: string;
  private readonly dataDir: string;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private enabled = false;

  constructor(config: SchedulerConfig) {
    this.intervalHours = config.intervalHours;
    this.retentionDays = config.retentionDays;
    this.minKeepCount = config.minKeepCount;
    this.backupDir = config.backupDir;
    this.dataDir = config.dataDir;

    // S3 stub: 检查 env, 提示 future 实现
    if (process.env.BACKUP_S3_ENDPOINT || process.env.BACKUP_S3_BUCKET) {
      console.warn(
        '[BackupScheduler] S3 upload 已配置 env 但尚未实现 — 待 SP-FX-40 完成。' +
        ` endpoint=${process.env.BACKUP_S3_ENDPOINT ?? '(未设置)'}` +
        ` bucket=${process.env.BACKUP_S3_BUCKET ?? '(未设置)'}`,
      );
    }
  }

  // ─── 启动调度器 ──────────────────────────────────────────────

  start(): void {
    if (this.enabled) return;
    this.enabled = true;

    // 立即执行一次
    void this.runOnce().then(() => {
      this.updateNextRunAt();
    });

    // 设置 setInterval (每 intervalHours 小时)
    this.timer = setInterval(() => {
      void this.runOnce().then(() => {
        this.updateNextRunAt();
      });
    }, this.intervalHours * 60 * 60 * 1000);
  }

  // ─── 停止调度器 ──────────────────────────────────────────────

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
  }

  // ─── 获取当前状态 ─────────────────────────────────────────────

  getState(): SchedulerState {
    return {
      enabled: this.enabled,
      intervalHours: this.intervalHours,
      retentionDays: this.retentionDays,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
    };
  }

  // ─── 更新配置 ────────────────────────────────────────────────

  updateConfig(opts: Partial<Pick<SchedulerConfig, 'intervalHours' | 'retentionDays'>>): void {
    if (opts.intervalHours !== undefined) this.intervalHours = opts.intervalHours;
    if (opts.retentionDays !== undefined) this.retentionDays = opts.retentionDays;
    if (this.enabled && this.lastRunAt !== null) {
      this.updateNextRunAt();
    }
  }

  // ─── 单次执行: 备份 + retention prune ──────────────────────

  async runOnce(): Promise<void> {
    await this.spawnBackup();
    this.lastRunAt = new Date().toISOString();
    this.pruneOldBackups();
  }

  // ─── 内部: 计算 nextRunAt ────────────────────────────────────

  private updateNextRunAt(): void {
    if (this.lastRunAt === null) return;
    const lastMs = new Date(this.lastRunAt).getTime();
    this.nextRunAt = new Date(lastMs + this.intervalHours * 60 * 60 * 1000).toISOString();
  }

  // ─── 内部: spawn backup-db.sh ───────────────────────────────

  private spawnBackup(): Promise<void> {
    return new Promise((res) => {
      // repo root: BIOCORE_ROOT env ?? __dirname/../../../..
      const repoRoot = process.env.BIOCORE_ROOT ?? pathResolve(__dirname, '../../..');
      const mainDbPath = join(this.dataDir, 'biocore.db');
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        BACKUP_DIR: this.backupDir,
        DB_PATH: mainDbPath,
      };

      const child = spawn('bash', ['scripts/backup-db.sh'], { env, cwd: repoRoot });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code !== 0) {
          console.warn(`[BackupScheduler] backup-db.sh exit ${code}: ${stderr.trim()}`);
        }
        res();
      });
      child.on('error', (err) => {
        console.warn(`[BackupScheduler] spawn 失败: ${err.message}`);
        res();
      });
    });
  }

  // ─── 内部: retention prune ──────────────────────────────────

  private pruneOldBackups(): void {
    try {
      mkdirSync(this.backupDir, { recursive: true });
      const cutoffMs = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;

      // 列出备份文件, 按 mtime 降序 (最新在前)
      const files = readdirSync(this.backupDir)
        .filter(f => f.endsWith('.sqlite') || f.endsWith('.db.gz') || f.endsWith('.db'))
        .map(f => {
          const fullPath = join(this.backupDir, f);
          const stat = statSync(fullPath);
          return { filename: f, fullPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs); // 最新在前

      // 从第 minKeepCount 个开始, 删除超过 retentionDays 的旧文件
      for (let i = this.minKeepCount; i < files.length; i++) {
        const f = files[i];
        if (f.mtimeMs < cutoffMs) {
          try {
            unlinkSync(f.fullPath);
            console.log(`[BackupScheduler] retention prune: 删除旧备份 ${f.filename}`);
          } catch (e) {
            console.warn(`[BackupScheduler] 删除失败 ${f.filename}: ${(e as Error).message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[BackupScheduler] pruneOldBackups 异常: ${(e as Error).message}`);
    }
  }
}

// ─── 工厂函数: 从 env 创建 scheduler ────────────────────────

export function createBackupSchedulerFromEnv(dataDir: string): BackupScheduler | null {
  // 仅当 BACKUP_INTERVAL_HOURS 明确设置时才启动 scheduler
  if (!process.env.BACKUP_INTERVAL_HOURS) return null;

  const intervalHours = Number(process.env.BACKUP_INTERVAL_HOURS);
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
  const minKeepCount = Number(process.env.BACKUP_MIN_KEEP ?? 5);
  const backupDir = join(dataDir, 'backups');

  return new BackupScheduler({ intervalHours, retentionDays, minKeepCount, backupDir, dataDir });
}
