# SP-FX-20: Backup / Restore UI — Design Spec

**Sprint**: SP-FX-20  
**Date**: 2026-05-18  
**Author**: Claude Sonnet 4.6 (自治 agent)

---

## 1. 背景

BIOCore 目前只有 `scripts/backup-db.sh` + `scripts/restore-db.sh` 两个 CLI 脚本。运维人员须 SSH 登录服务器手动执行。本 sprint 为 admin 用户提供 web 界面，可从浏览器触发备份、列出历史备份、下载备份文件、执行恢复。

### 1.1 现有脚本分析

- `backup-db.sh`: 接收环境变量 `DB_PATH`、`BACKUP_DIR`、`RETENTION_DAYS`；生成 `$BACKUP_DIR/biocore-<TS>.db.gz`；内置 sqlite3 integrity_check。
- `restore-db.sh`: 接收位置参数 `$1`（备份文件路径）；需 `CONFIRM=1` 环境变量才真正执行；检查端口 3001 是否占用；会把当前 DB 重命名为 `.pre-restore-<TS>`。
- **注意**: restore 脚本要求 server 停止（检查 port 3001），因此 web UI 触发 restore 时，server 本身正在运行，脚本会直接失败。**解决方案**: restore API 不调 spawn(restore-db.sh)；改为直接用 `better-sqlite3` 的 `.backup()` API，在 server 运行期执行热恢复（等同脚本逻辑，但不检查端口）。

### 1.2 现有备份路径

`DATA_DIR`（默认 `./data`）存放 `biocore.db`。新建独立目录 `data/backups/` 用于 web UI 触发的备份，以便与脚本产生的 `./backups/` 区分管理。

---

## 2. 架构

```
浏览器 (admin only)
  │
  ├─ GET  /api/v1/admin/backups           列出 data/backups/*.sqlite
  ├─ POST /api/v1/admin/backup            触发新备份 → spawn backup-db.sh
  ├─ GET  /api/v1/admin/backups/:filename 下载 stream
  └─ POST /api/v1/admin/restore           上传 .sqlite → 热恢复
         ↓
  packages/server/src/backup-routes.ts
         ↓
  data/backups/          (备份存储目录)
  scripts/backup-db.sh   (备份脚本, BACKUP_DIR=data/backups)
```

### 2.1 路由注册

`backup-routes.ts` 导出 `registerBackupRoutes(router, deps)`，在 `index.ts` 末尾 append 一行（在 `app.use` 之前）：

```ts
registerBackupRoutes(apiRouter, { dataDir: DATA_DIR });
```

挂在 `apiRouter`（`/api/v1`）下，因此实际路径为 `/api/v1/admin/backup`、`/api/v1/admin/backups` 等。

---

## 3. Server API 设计

### 3.1 POST /admin/backup

- **Auth**: `requireRole('admin')`
- **动作**: `spawn('bash', ['scripts/backup-db.sh'])` 并设 env `BACKUP_DIR=<dataDir>/backups`
- **返回**: `{ success: true, filename, size, path }`
- **错误**: spawn 非零退出 → 500

### 3.2 GET /admin/backups

- **Auth**: `requireRole('admin')`
- **动作**: `readdirSync(backupDir)` 过滤 `*.sqlite` + `*.db.gz`（脚本生成 .db.gz，需同时支持）
- **返回**: `{ backups: [{ filename, size, mtime }] }` 按 mtime 倒序

### 3.3 GET /admin/backups/:filename

- **Auth**: `requireRole('admin')`
- **安全**: 文件名 sanitize（不含 `/`、`..`、只允许 `[a-zA-Z0-9._-]`）
- **动作**: `fs.createReadStream` → pipe，`Content-Disposition: attachment`
- **错误**: 文件不存在 → 404

### 3.4 POST /admin/restore

- **Auth**: `requireRole('admin')`
- **上传**: 用 `multer`（已是 dep: `^1.4.5-lts.1`）接 multipart
- **安全检查 (三重)**:
  1. 文件大小限制: `limits: { fileSize: 100 * 1024 * 1024 }` (100 MB)
  2. 文件名 sanitize: 禁止 path traversal
  3. Magic bytes: 前 16 字节必须以 `SQLite format 3\0` 开头
- **恢复实现**: 
  - 打开上传文件为 `better-sqlite3` Database (readonly)
  - `PRAGMA integrity_check` 验证
  - 调用 `uploadedDb.backup(mainDbPath)` 将上传内容写入主 DB 路径
  - 关闭 uploadedDb，删除临时文件
  - 返回 `{ success: true, message: '恢复成功，请重启 server 使更改生效' }`

### 3.5 Multer 配置

```ts
import multer from 'multer';
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
```

---

## 4. 前端 Page 设计

### 路径: `/scada2/backup/page.tsx`

**布局**:
```
┌────────────────────────────────────────────┐
│ 数据库备份与恢复                [立即备份] │
├────────────────────────────────────────────┤
│ 文件名              大小   时间   操作      │
│ biocore-20260518.db.gz  1.2MB  05-18  [下载][恢复] │
│ …                                          │
└────────────────────────────────────────────┘
```

**行为**:
- 页面加载: `GET /api/v1/admin/backups` 填充表格
- "立即备份": `POST /api/v1/admin/backup` → 成功后 refetch 列表，toast 通知
- "下载": `window.open('/api/v1/admin/backups/<filename>')` 触发浏览器下载
- "恢复": 点击 → ConfirmDialog（复用 `@/scada-engine/dialogs/ConfirmDialog`）→ 确认后 multipart POST → 成功弹提示"恢复成功，请重启 server"

**Role guard**: `if (user?.role !== 'admin') return <div>无权限</div>`

---

## 5. 安全要点

| 检查项 | 实现 |
|--------|------|
| Admin only | `requireRole('admin')` 每个 endpoint |
| 文件大小 | multer `limits.fileSize = 100MB` |
| 文件名 path traversal | `/[^a-zA-Z0-9._-]/.test(filename)` → 400 |
| SQLite magic bytes | `buf.slice(0,15).toString() === 'SQLite format 3'` |
| integrity_check | `new Database(tmp).prepare('PRAGMA integrity_check').get()` |

---

## 6. 测试计划

### Server (目标 +5-7 tests)

1. GET /admin/backups 空目录返回空数组
2. GET /admin/backups 列出现有文件含 size/mtime
3. POST /admin/backup 非 admin → 403
4. GET /admin/backups/:filename 下载成功
5. GET /admin/backups/:filename path traversal → 400
6. POST /admin/restore 非 .sqlite 文件 → 400 (magic bytes 失败)
7. POST /admin/restore 超大文件 → 413

### Web-UI (目标 +6-8 tests)

1. 渲染空状态 "暂无备份"
2. 渲染备份列表
3. admin 显示操作按钮
4. 非 admin 显示无权限
5. "立即备份" 点击 → 调 POST → refetch
6. "下载" 按钮链接正确
7. "恢复" 打开确认 dialog
8. 恢复确认 → 调 POST restore

### PW E2E (+1 test)

- admin 登录 → /scada2/backup → 触发备份 → 验证新行出现 → 点击下载（验证 response attachment header）

---

## 7. 范围外

- `restore-db.sh` 的 CLI 路径（脚本本身不动）
- 非 admin 用户的任何 restore 功能
- FUXA/mosquitto 备份（脚本已有, web UI 不涉及）
- 备份自动调度
