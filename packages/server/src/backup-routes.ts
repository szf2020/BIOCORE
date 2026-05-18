// ============================================================
// backup-routes.ts — SP-FX-20 Backup / Restore UI 后端路由
// ============================================================
// Routes (挂在 /api/v1 下):
//   POST /admin/backup               触发备份 (spawn backup-db.sh)
//   GET  /admin/backups              列出 data/backups/ 目录
//   GET  /admin/backups/:filename    下载备份文件 (stream)
//   POST /admin/restore              上传 .sqlite 恢复 (magic bytes 校验)
//
// 安全:
//   - 全部 endpoints requireRole('admin')
//   - 文件名 sanitize (禁止 path traversal)
//   - restore: 文件大小 ≤100MB + magic bytes + integrity_check
// ============================================================

import type { Router } from 'express';
import {
  mkdirSync,
  readdirSync,
  statSync,
  createReadStream,
  existsSync,
  unlinkSync,
  openSync,
  readSync,
  closeSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import multer from 'multer';
import Database from 'better-sqlite3';
import { requireRole } from './middlewares/auth';

export interface BackupRoutesDeps {
  /** 数据目录, 默认 DATA_DIR = './data'. backups 子目录在此下创建. */
  dataDir: string;
}

// SQLite 文件头魔数: "SQLite format 3\0" (前 16 字节)
const SQLITE_MAGIC = 'SQLite format 3\0';

// 文件名白名单: 仅允许 [a-zA-Z0-9._-]，防止 path traversal
function isSafeFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

// 校验上传文件的 SQLite magic bytes
function hasSqliteMagic(filePath: string): boolean {
  try {
    const fd = openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    readSync(fd, buf, 0, 16, 0);
    closeSync(fd);
    return buf.toString('utf8') === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

// multer: 上传到 tmpdir，限制 100MB
const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// 列出 backups 目录中的备份文件 (按 mtime 倒序)
function listBackupFiles(backupDir: string): Array<{ filename: string; size: number; mtime: string }> {
  mkdirSync(backupDir, { recursive: true });
  return readdirSync(backupDir)
    .filter(f => f.endsWith('.sqlite') || f.endsWith('.db.gz') || f.endsWith('.db'))
    .map(f => {
      const s = statSync(join(backupDir, f));
      return { filename: f, size: s.size, mtime: s.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
}

export function registerBackupRoutes(router: Router, deps: BackupRoutesDeps): void {
  const { dataDir } = deps;
  const backupDir = join(dataDir, 'backups');
  const mainDbPath = join(dataDir, 'biocore.db');

  // 确保 backups 目录存在
  mkdirSync(backupDir, { recursive: true });

  // ─── POST /admin/backup ────────────────────────────────
  router.post('/admin/backup', requireRole('admin'), (req, res) => {
    const scriptPath = 'scripts/backup-db.sh';
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BACKUP_DIR: backupDir,
      DB_PATH: mainDbPath,
    };

    const child = spawn('bash', [scriptPath], { env, cwd: process.cwd() });
    let stderr = '';

    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        res.status(500).json({ error: `备份失败 (exit ${code}): ${stderr.trim()}` });
        return;
      }

      try {
        const files = listBackupFiles(backupDir);
        const latest = files[0];
        res.json({
          success: true,
          filename: latest?.filename ?? '',
          size: latest?.size ?? 0,
          path: latest ? join(backupDir, latest.filename) : '',
        });
      } catch {
        res.json({ success: true, filename: '', size: 0, path: '' });
      }
    });

    child.on('error', (err) => {
      res.status(500).json({ error: `spawn 失败: ${err.message}` });
    });
  });

  // ─── GET /admin/backups ────────────────────────────────
  router.get('/admin/backups', requireRole('admin'), (_req, res) => {
    try {
      res.json({ backups: listBackupFiles(backupDir) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ─── GET /admin/backups/:filename ──────────────────────
  router.get('/admin/backups/:filename', requireRole('admin'), (req, res) => {
    const { filename } = req.params;

    if (!isSafeFilename(filename)) {
      res.status(400).json({ error: '非法文件名 (禁止 path traversal)' });
      return;
    }

    const filePath = join(backupDir, filename);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: '备份文件不存在' });
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  });

  // ─── POST /admin/restore ───────────────────────────────
  router.post(
    '/admin/restore',
    requireRole('admin'),
    upload.single('file'),
    (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: '缺少上传文件 (field: file)' });
        return;
      }

      const tmpPath = req.file.path;
      const cleanup = () => {
        try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
      };

      // 1. Magic bytes 校验
      if (!hasSqliteMagic(tmpPath)) {
        cleanup();
        res.status(400).json({ error: '文件格式错误: 非 SQLite format 3 magic bytes' });
        return;
      }

      // 2. Integrity check
      let uploadedDb: InstanceType<typeof Database> | null = null;
      try {
        uploadedDb = new Database(tmpPath, { readonly: true });
        const row = uploadedDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        if (row.integrity_check !== 'ok') {
          uploadedDb.close();
          cleanup();
          res.status(400).json({ error: `备份文件损坏: integrity_check=${row.integrity_check}` });
          return;
        }

        // 3. 热恢复: 将 uploadedDb 内容 backup 到临时路径，再原子复制到主 DB 路径
        // 注意: close 必须在 backup().then() 内部执行，不能提前 close
        const restoreTmp = join(tmpdir(), `restore-target-${Date.now()}.db`);
        uploadedDb.backup(restoreTmp)
          .then(() => {
            try { uploadedDb?.close(); } catch {}
            try {
              copyFileSync(restoreTmp, mainDbPath);
            } finally {
              try { unlinkSync(restoreTmp); } catch {}
            }
            cleanup();
            res.json({ success: true, message: '恢复成功，请重启 server 使更改生效' });
          })
          .catch((backupErr: Error) => {
            try { uploadedDb?.close(); } catch {}
            cleanup();
            res.status(500).json({ error: `恢复失败: ${backupErr.message}` });
          });
      } catch (e) {
        try { uploadedDb?.close(); } catch {}
        cleanup();
        res.status(500).json({ error: `处理失败: ${(e as Error).message}` });
      }
    },
  );
}
