#!/usr/bin/env bash
# BIOCore SQLite 恢复脚本
# 从指定备份恢复 DB. 默认 dry-run, 需 CONFIRM=1 才真正执行.
# 恢复前自动把当前 DB 重命名为 .pre-restore-<TS> 双保险.
#
# 用法:
#   bash scripts/restore-db.sh ./backups/biocore-20260514-040000.db.gz       # dry-run
#   CONFIRM=1 bash scripts/restore-db.sh ./backups/biocore-20260514-040000.db.gz

set -euo pipefail

BACKUP_FILE="${1:-}"
DB_PATH="${DB_PATH:-./packages/server/data/biocore.db}"
CONFIRM="${CONFIRM:-0}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "用法: bash scripts/restore-db.sh <备份文件.db.gz>" >&2
  echo "示例: bash scripts/restore-db.sh ./backups/biocore-20260514-040000.db.gz" >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: 备份文件不存在: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 命令未找到" >&2
  exit 1
fi

# 解压到临时文件
TMP=$(mktemp -t biocore-restore.XXXXXX.db)
trap 'rm -f "$TMP"' EXIT

case "$BACKUP_FILE" in
  *.gz) gunzip -c "$BACKUP_FILE" > "$TMP" ;;
  *)    cp "$BACKUP_FILE" "$TMP" ;;
esac

# 校验备份完整性
INTEGRITY=$(sqlite3 "$TMP" "PRAGMA integrity_check;" | head -1)
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "ERROR: 备份文件损坏, integrity_check=$INTEGRITY" >&2
  exit 1
fi

ROWS_BATCHES=$(sqlite3 "$TMP" "SELECT COUNT(*) FROM batches" 2>/dev/null || echo "?")
ROWS_RECIPES=$(sqlite3 "$TMP" "SELECT COUNT(*) FROM recipes" 2>/dev/null || echo "?")

echo "[restore] 备份: $BACKUP_FILE"
echo "[restore] 目标: $DB_PATH"
echo "[restore] 备份完整性: ok"
echo "[restore] 备份内容: batches=$ROWS_BATCHES, recipes=$ROWS_RECIPES"

if [[ "$CONFIRM" != "1" ]]; then
  echo ""
  echo "★ DRY RUN — 未执行恢复"
  echo "★ 确认无误后用: CONFIRM=1 bash scripts/restore-db.sh $BACKUP_FILE"
  exit 0
fi

# 关停服务检测
if lsof -i :3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: 端口 3001 仍有 server 在运行, 请先停止服务" >&2
  exit 1
fi

# 双保险: 当前 DB 改名留底
if [[ -f "$DB_PATH" ]]; then
  TS=$(date +%Y%m%d-%H%M%S)
  PRE="$DB_PATH.pre-restore-$TS"
  mv "$DB_PATH" "$PRE"
  rm -f "$DB_PATH-wal" "$DB_PATH-shm"   # 清理 WAL 残余, 避免和恢复版本冲突
  echo "[restore] 当前 DB 已保留为: $PRE"
fi

mv "$TMP" "$DB_PATH"
trap - EXIT

echo "[restore] 完成. 启动 server 验证: pnpm dev:server"
