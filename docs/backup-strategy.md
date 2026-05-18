# BIOCore 备份策略文档

**版本**: 1.0 (SP-FX-39)
**更新**: 2026-05-18

---

## 1. 概述

BIOCore 使用 SQLite 作为主数据库（`data/biocore.db`）。备份策略包括：
- **手动备份**（SP-FX-20）：通过 Web UI 或 API 触发
- **定时自动备份**（SP-FX-39）：`setInterval` 调度，无第三方依赖
- **保留策略**（SP-FX-39）：自动清理过期备份，防止磁盘占满
- **远程上传**（SP-FX-40+，未来）：S3-compatible 对象存储

---

## 2. 备份工具

### 2.1 backup-db.sh

脚本路径: `scripts/backup-db.sh`

功能：
- 使用 `sqlite3 .backup` 热备份主数据库（无需停服务）
- 输出文件名格式: `biocore-YYYYMMDD-HHMMSS.db.gz`
- 环境变量:
  - `DB_PATH`: 数据库路径（默认 `data/biocore.db`）
  - `BACKUP_DIR`: 输出目录（默认 `data/backups/`）
  - `BIOCORE_ROOT`: repo root 路径（自动推导，KI-1 SP-FX-34）

---

## 3. 定时调度策略

### 3.1 启用条件

仅当 `BACKUP_INTERVAL_HOURS` 环境变量已设置时，scheduler 才会在服务启动时自动启动。

### 3.2 环境变量

| 变量 | 默认值 | 范围 | 描述 |
|------|--------|------|------|
| `BACKUP_INTERVAL_HOURS` | — | 1–168 | 调度间隔（小时）。**未设置则不启动 scheduler** |
| `BACKUP_RETENTION_DAYS` | `30` | 1–365 | 保留天数 |
| `BACKUP_MIN_KEEP` | `5` | 1+ | 最少保留文件数（即使全部过期也不删） |

### 3.3 调度行为

1. 服务启动时，若 `BACKUP_INTERVAL_HOURS` 已设置 → 立即执行一次备份
2. 此后每 `BACKUP_INTERVAL_HOURS` 小时执行一次
3. 每次备份后自动执行 retention prune
4. 服务 shutdown（SIGINT/SIGTERM）时自动调用 `scheduler.stop()` 清理 timer

### 3.4 运行时修改

通过 API 可在不重启服务的情况下修改调度参数：

```http
POST /api/v1/admin/backup/schedule
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "intervalHours": 12, "retentionDays": 14 }
```

---

## 4. 保留策略

### 4.1 算法

```
files = 按 mtime 降序排列的所有备份文件 (newest first)
for i = BACKUP_MIN_KEEP; i < files.length; i++:
  if files[i].mtime < (now - BACKUP_RETENTION_DAYS * 86400s):
    delete files[i]
```

### 4.2 安全保障

- 前 `BACKUP_MIN_KEEP` 个最新文件**永远不删除**（即使超过 retentionDays）
- 防止调度失败导致全部备份消失的极端情况

### 4.3 推荐配置示例

| 场景 | INTERVAL | RETENTION | MIN_KEEP |
|------|----------|-----------|----------|
| 生产（高频） | 6h | 30 | 10 |
| 生产（标准） | 24h | 30 | 5 |
| 开发/测试 | 168h (1周) | 7 | 2 |

---

## 5. API 接口

### 5.1 GET /api/v1/admin/backup/schedule

获取当前调度状态。需要 `admin` 权限。

响应示例：
```json
{
  "enabled": true,
  "intervalHours": 24,
  "retentionDays": 30,
  "lastRunAt": "2026-05-18T06:00:00.000Z",
  "nextRunAt": "2026-05-19T06:00:00.000Z"
}
```

当 scheduler 未启用（`BACKUP_INTERVAL_HOURS` 未设置）时返回 503。

### 5.2 POST /api/v1/admin/backup/schedule

修改调度参数（热更新，无需重启）。需要 `admin` 权限。

请求体（任意字段可选）：
```json
{ "intervalHours": 12, "retentionDays": 14 }
```

---

## 6. 远程上传 (S3-compatible) — 待 SP-FX-40 实现

### 6.1 Stub 状态

当前版本（SP-FX-39）已声明以下环境变量，但**尚未实现**上传逻辑。
启动时若检测到这些 env 会打印 warning。

| 变量 | 描述 |
|------|------|
| `BACKUP_S3_ENDPOINT` | S3-compatible 端点 (e.g. `https://s3.amazonaws.com`) |
| `BACKUP_S3_BUCKET` | Bucket 名称 |
| `BACKUP_S3_ACCESS_KEY` | Access Key ID |
| `BACKUP_S3_SECRET_KEY` | Secret Access Key |

### 6.2 实现计划 (SP-FX-40+)

- 使用 Node.js 原生 `https` 模块，**不引入 aws-sdk**
- 实现 AWS Signature V4 签名
- 上传逻辑：每次备份成功后异步上传到 S3，失败只 warn 不影响本地备份

---

## 7. 灾备 SOP (Standard Operating Procedure)

### 7.1 日常备份验证

```bash
# 列出当前备份文件
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/api/v1/admin/backups

# 检查 scheduler 状态
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/api/v1/admin/backup/schedule
```

### 7.2 手动触发立即备份

```bash
curl -X POST -H "Authorization: Bearer <admin-token>" \
  http://localhost:3001/api/v1/admin/backup
```

### 7.3 恢复流程

1. 从 Web UI `/scada2/backup` 或 API 下载目标备份文件
2. 通过 Web UI "恢复" 按钮或 API `POST /api/v1/admin/restore` 上传
3. 等待服务返回 `{ "success": true }` 后**重启 server**
4. 验证数据完整性（检查最近的批次记录、配方等）

```bash
# API 恢复
curl -X POST -H "Authorization: Bearer <admin-token>" \
  -F "file=@biocore-20260518-060000.db.gz" \
  http://localhost:3001/api/v1/admin/restore
```

### 7.4 灾难恢复检查清单

- [ ] 确认最新备份时间（`GET /api/v1/admin/backup/schedule` 查 `lastRunAt`）
- [ ] 选择目标备份文件（优先最近的完整备份）
- [ ] 停止 server（防止写入冲突）
- [ ] 上传恢复文件
- [ ] 重启 server
- [ ] 验证 `GET /api/v1/admin/backups` 列表
- [ ] 验证业务数据（批次、配方、用户、SCADA 视图）

---

## 8. 架构注意事项

- **AI 模块永远不能直接写入 PLC** — 备份/恢复与 animation-engine T8 安全 invariant 无关
- 备份文件存储在 `data/backups/` 目录；确保该目录有足够磁盘空间
- SQLite WAL 模式：热备份时无需停服务，但恢复后需重启以重新打开数据库连接
- 并发安全：scheduler.start() 内有 `if (this.enabled) return` guard，防止重复启动
