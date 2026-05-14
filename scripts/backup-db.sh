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

# ─── W2 扩展: FUXA HMI 项目 + mosquitto 持久化数据备份 ───
# Level 3 任务: 单一备份覆盖 BIOCore + FUXA + MQTT broker
if [[ -d "./fuxa" ]] && [[ "$(ls -A ./fuxa/appdata 2>/dev/null)" || "$(ls -A ./fuxa/db 2>/dev/null)" ]]; then
  FUXA_OUT="$BACKUP_DIR/fuxa-$TS.tar.gz"
  echo "[backup] FUXA 数据 → $FUXA_OUT"
  tar -czf "$FUXA_OUT" -C . fuxa/appdata fuxa/db fuxa/images 2>/dev/null || true
  FUXA_SIZE=$(du -h "$FUXA_OUT" 2>/dev/null | cut -f1)
  echo "[backup] FUXA 完成: $FUXA_OUT ($FUXA_SIZE)"
  find "$BACKUP_DIR" -name "fuxa-*.tar.gz" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null
fi

if [[ -d "./mosquitto/data" ]] && [[ "$(ls -A ./mosquitto/data 2>/dev/null)" ]]; then
  MQTT_OUT="$BACKUP_DIR/mosquitto-$TS.tar.gz"
  echo "[backup] mosquitto 数据 → $MQTT_OUT"
  tar -czf "$MQTT_OUT" -C . mosquitto/data 2>/dev/null || true
  MQTT_SIZE=$(du -h "$MQTT_OUT" 2>/dev/null | cut -f1)
  echo "[backup] mosquitto 完成: $MQTT_OUT ($MQTT_SIZE)"
  find "$BACKUP_DIR" -name "mosquitto-*.tar.gz" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null
fi
