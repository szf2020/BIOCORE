#!/usr/bin/env bash
# BIOCore SQLite 备份脚本
# 使用 sqlite3 .backup 命令在线一致性备份, 不阻塞读写
# 自动 gzip 压缩, 自动清理 30 天前旧备份
#
# 用法:
#   bash scripts/backup-db.sh                          # 默认 DB 和目录
#   DB_PATH=./data/biocore.db bash scripts/backup-db.sh
#   BACKUP_DIR=/mnt/nas/biocore-backups bash scripts/backup-db.sh
#   RETENTION_DAYS=90 bash scripts/backup-db.sh

set -euo pipefail

DB_PATH="${DB_PATH:-./packages/server/data/biocore.db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: DB 文件不存在: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 命令未找到, 请先安装" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/biocore-$TS.db"

echo "[backup] 源: $DB_PATH"
echo "[backup] 目标: $OUT.gz"

# 在线热备份: sqlite3 .backup 保证一致性, 即使有并发写入
sqlite3 "$DB_PATH" ".backup '$OUT'"

# 校验完整性
INTEGRITY=$(sqlite3 "$OUT" "PRAGMA integrity_check;" | head -1)
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "ERROR: 备份完整性校验失败: $INTEGRITY" >&2
  rm -f "$OUT"
  exit 1
fi

gzip "$OUT"
SIZE=$(du -h "$OUT.gz" | cut -f1)
echo "[backup] 完成: $OUT.gz ($SIZE)"

# 清理超过保留期的旧备份
DELETED=$(find "$BACKUP_DIR" -name "biocore-*.db.gz" -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
if [[ "$DELETED" -gt 0 ]]; then
  echo "[backup] 清理 $DELETED 个超 $RETENTION_DAYS 天旧备份"
fi
