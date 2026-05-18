# SP-FX-39 设计规范：Backup Automation (Scheduled + Retention)

**日期**: 2026-05-18
**Sprint**: SP-FX-39
**依赖**: SP-FX-20 (手动 backup UI), SP-FX-34 KI-1 (getRepoRoot fix)

---

## 1. 目标

在 SP-FX-20 手动备份基础上，增加：
1. 定时自动备份（setInterval，ZERO 新第三方依赖）
2. 保留策略（旧文件自动清理 + 最少保留 N 个）
3. REST API 查询 / 修改调度状态
4. Web UI /scada2/backup 页面展示 schedule 信息
5. 远程上传 stub（S3-compatible，仅 env 声明，future SP-FX-40+）

---

## 2. 核心模块

### 2.1 BackupScheduler (`packages/server/src/services/backup-scheduler.ts`)

```typescript
export interface SchedulerConfig {
  intervalHours: number;      // 默认 24
  retentionDays: number;      // 默认 30
  minKeepCount: number;       // 默认 5 (防止全清空)
  backupDir: string;
  dataDir: string;
}

export interface SchedulerState {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  lastRunAt: string | null;   // ISO string
  nextRunAt: string | null;   // ISO string
}

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private state: SchedulerState;

  constructor(config: SchedulerConfig) { ... }
  start(): void;              // 启 setInterval
  stop(): void;               // clearInterval (shutdown cleanup)
  getState(): SchedulerState;
  updateConfig(opts: Partial<Pick<SchedulerConfig, 'intervalHours' | 'retentionDays'>>): void;
  runOnce(): Promise<void>;   // 立即执行备份 + 清理
}
```

调度逻辑：
- `start()` 先调 `runOnce()`，再 setInterval 每 N 小时执行
- `runOnce()` = spawn backup-db.sh + 执行 retention prune
- retention prune: 按 mtime 排序，删除 mtime > retentionDays 且总数超过 minKeepCount 的旧文件

### 2.2 Retention Policy

```
files = listBackupFiles(backupDir) sorted by mtime DESC (newest first)
eligible_for_delete = files where index >= minKeepCount AND mtime > retentionDays ago
delete each eligible_for_delete
```

确保即使所有文件都过期，也保留最新的 minKeepCount 个文件。

### 2.3 新 API Endpoints

挂在现有 `backup-routes.ts` 的 router 上：

| Method | Path | 描述 |
|--------|------|------|
| GET | /api/v1/admin/backup/schedule | 返回当前 scheduler 状态 |
| POST | /api/v1/admin/backup/schedule | 更新 interval / retentionDays |

GET 响应：
```json
{
  "enabled": true,
  "intervalHours": 24,
  "retentionDays": 30,
  "lastRunAt": "2026-05-18T06:00:00.000Z",
  "nextRunAt": "2026-05-19T06:00:00.000Z"
}
```

POST 请求体：
```json
{ "intervalHours": 12, "retentionDays": 14 }
```

### 2.4 Web UI Schedule 区块

在 `/scada2/backup/page.tsx` 底部添加 "自动备份调度" 区块：
- 展示 enabled / last_run / next_run / interval / retention_days
- 提供 intervalHours / retentionDays 修改 input + "保存" button

---

## 3. 远程上传 Stub (Part 5 — future)

仅声明 env vars，不实现实际上传逻辑：
```
BACKUP_S3_ENDPOINT=
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
```

在 BackupScheduler 构造函数检查这些 env，若存在则 console.warn 提示 "S3 upload 待 SP-FX-40 实现"。

---

## 4. 环境变量

| 变量 | 默认 | 描述 |
|------|------|------|
| `BACKUP_INTERVAL_HOURS` | `24` | 调度间隔（小时） |
| `BACKUP_RETENTION_DAYS` | `30` | 保留天数 |
| `BACKUP_MIN_KEEP` | `5` | 最少保留文件数 |
| `BACKUP_S3_ENDPOINT` | — | S3 endpoint (stub) |
| `BACKUP_S3_BUCKET` | — | S3 bucket (stub) |
| `BACKUP_S3_ACCESS_KEY` | — | S3 access key (stub) |
| `BACKUP_S3_SECRET_KEY` | — | S3 secret key (stub) |

---

## 5. 安全约束

- 所有 schedule endpoints 仍需 `requireRole('admin')`
- `intervalHours` 范围: 1–168 (1h 到 1 week)
- `retentionDays` 范围: 1–365
- 文件删除只在 backupDir 内操作，不做 path traversal

---

## 6. 不触碰文件

- `scripts/backup-db.sh` — 复用，不改
- 任何 widget / RuntimeCanvas / dict files / migrations
- nginx / grafana 配置

---

## 7. 测试覆盖目标

| 模块 | tests |
|------|-------|
| backup-scheduler.ts (scheduler) | 5-7 |
| backup-scheduler.ts (retention) | 3-4 |
| backup-routes.ts (schedule API) | 2 |
| web-ui backup/page.tsx | 4 |
| 合计 | 14-17 |
