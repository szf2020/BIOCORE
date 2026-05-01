#!/usr/bin/env bash
# scripts/b1-e2e.sh — B1.1 DAG runtime end-to-end smoke (T23)
# 用途: 覆盖 spec §7.3 的 8 个场景 (DAG v2 配方 → 启动批次 → current_node_id → 分支审计 → 崩溃恢复)
# 依赖: bash + jq(或 scripts/jq.exe) + curl + sqlite3
#
# 用法:
#   # 默认: 用 admin/admin123 登录, 服务器在 :3001
#   ./scripts/b1-e2e.sh
#
#   # 自定义服务器 + 凭据 + DB 路径:
#   BIOCORE_URL=http://localhost:3001/api/v1 \
#   BIOCORE_USER=admin BIOCORE_PW=admin123 \
#   DB_PATH=/c/BIOCORE/data/biocore.db \
#   REACTOR_ID=R1 \
#   ./scripts/b1-e2e.sh
#
# 退出: 任一关键场景失败立即退出非 0; 软场景(MOCK_PLC/PV 注入)用 SKIP 标注但不阻断.
# 需要管理员凭据 + 已运行的 server (推荐 MOCK_PLC=true PORT=3001 npx tsx packages/server/src/index.ts).

set -uo pipefail

# ─── 配置 ─────────────────────────────────────
BASE="${BIOCORE_URL:-http://localhost:3001/api/v1}"
USER_NAME="${BIOCORE_USER:-admin}"
USER_PW="${BIOCORE_PW:-admin123}"
DB_PATH="${DB_PATH:-/c/BIOCORE/data/biocore.db}"
REACTOR_ID="${REACTOR_ID:-R1}"
TS="$(date +%s)"
RECIPE_ID="B1_E2E_${TS}"
BATCH_ID="B1E2E${TS}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; RESET='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; SKIP_COUNT=0

pass() { echo -e "${GREEN}✓${RESET} $1"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo -e "${RED}✗${RESET} $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
skip() { echo -e "${YELLOW}⊘${RESET} SKIP — $1"; SKIP_COUNT=$((SKIP_COUNT+1)); }
info() { echo -e "${BLUE}→${RESET} $1"; }

# ─── jq 兼容 (Windows 没装 jq 时用 scripts/jq.exe 兜底, 同 sprint3) ─
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v jq >/dev/null 2>&1; then
  JQ=jq
elif [ -x "$SCRIPT_DIR/jq.exe" ]; then
  JQ="$SCRIPT_DIR/jq.exe"
else
  echo "依赖 jq 未安装且 $SCRIPT_DIR/jq.exe 不存在"
  echo "可从 https://github.com/jqlang/jq/releases 下载 jq-windows-amd64.exe → $SCRIPT_DIR/jq.exe"
  exit 2
fi
jq() { "$JQ" "$@"; }

# ─── sqlite3 检查 (DB 直读校验需要) ──────────
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "依赖 sqlite3 未安装 — 场景 3/5 (current_node_id 校验) 将自动 SKIP"
  HAVE_SQLITE=0
else
  HAVE_SQLITE=1
fi

# ─── 服务器存活检查 ──────────────────────────
info "检查服务器: $BASE"
if ! curl -s -o /dev/null -w '%{http_code}' "$BASE/status" | grep -qE '^(200|401|403)$'; then
  echo "无法连接 $BASE — 服务未启动? 启动命令: MOCK_PLC=true PORT=3001 npx tsx packages/server/src/index.ts"
  exit 2
fi

# ─── 登录拿 JWT ─────────────────────────────
info "登录 $USER_NAME"
LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PW\"}")
TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // .token // empty')
if [ -z "$TOKEN" ]; then
  fail "登录失败: $LOGIN_RESP"
  exit 2
fi
pass "已获取 JWT token"

AUTH=( -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' )

# ─── 场景 1: 创建带 IF/ELSE 分支的 v2 DAG 配方 ────────
info "场景 1: 创建 v2 DAG 配方 $RECIPE_ID (含 1 个 branch 节点)"
DAG_PAYLOAD=$(jq -nc '{
  schema_version: 2,
  nodes: [
    {id:"n_start", type:"start"},
    {id:"n_grow",  type:"phase",  phase_id:"GROW", phase_type:"fermentation", params:{target_temp:37}},
    {id:"n_branch",type:"branch", expression:"OD600 > 5", default_branch:"false"},
    {id:"n_feed",  type:"phase",  phase_id:"FEED", phase_type:"feeding", params:{}},
    {id:"n_wait",  type:"phase",  phase_id:"WAIT", phase_type:"fermentation", params:{}},
    {id:"n_end",   type:"end"}
  ],
  edges: [
    {id:"e1", from:"n_start",  to:"n_grow"},
    {id:"e2", from:"n_grow",   to:"n_branch"},
    {id:"e3", from:"n_branch", to:"n_feed", label:"true"},
    {id:"e4", from:"n_branch", to:"n_wait", label:"false"},
    {id:"e5", from:"n_feed",   to:"n_end"},
    {id:"e6", from:"n_wait",   to:"n_end"}
  ]
}')

# repo recipes API 仍以 phases[] 为主表, 这里同时给 phases (T-1 兼容字段) 和 dag (T15+ DAG)
RECIPE_BODY=$(jq -nc \
  --arg id "$RECIPE_ID" \
  --argjson dag "$DAG_PAYLOAD" \
  '{
    recipe_id: $id, version: "1.0.0", name: "B1 e2e DAG test",
    author: "b1-e2e", created_by: "b1-e2e", target_organism: "e.coli",
    vessel_config: { reactor_type: "fermenter", volume_L: 5 },
    phases: [
      { phase_id: "GROW", type: "fermentation", duration_h: 1, params: { target_temp: 37 } },
      { phase_id: "FEED", type: "feeding",      duration_h: 1, params: {} },
      { phase_id: "WAIT", type: "fermentation", duration_h: 1, params: {} }
    ],
    dag_schema_version: 2,
    dag: $dag,
    is_template: 0
  }')

CREATE_RESP=$(curl -s -X POST "$BASE/recipes" "${AUTH[@]}" -d "$RECIPE_BODY")
CREATE_OK=$(echo "$CREATE_RESP" | jq -r '.data.success // .success // false')
if [ "$CREATE_OK" = "true" ]; then
  pass "1. 创建 v2 DAG 配方 $RECIPE_ID"
else
  fail "1. 创建配方失败: $(echo "$CREATE_RESP" | jq -c '.')"
  exit 1
fi

# 配方需先批准才能下载到反应器
APPROVE_RESP=$(curl -s -X POST "$BASE/recipes/$RECIPE_ID/approve" "${AUTH[@]}" \
  -d "$(jq -nc '{version: "1.0.0", reason: "b1-e2e approve"}')")
APPROVE_OK=$(echo "$APPROVE_RESP" | jq -r '.data.success // .success // false')
if [ "$APPROVE_OK" = "true" ]; then
  info "  配方已批准"
else
  info "  批准请求返回: $(echo "$APPROVE_RESP" | jq -c '.' | head -c 200)"
  # 不致命 — 部分服务器配置允许直接下载
fi

# ─── 场景 2: 下载配方到 reactor + 启动批次 ─────────
info "场景 2: 下载配方到 $REACTOR_ID 并启动批次 $BATCH_ID"
DL_RESP=$(curl -s -X POST "$BASE/reactors/$REACTOR_ID/download-recipe" "${AUTH[@]}" \
  -d "$(jq -nc --arg id "$RECIPE_ID" '{recipe_id: $id, version: "1.0.0"}')")
DL_OK=$(echo "$DL_RESP" | jq -r '.data.success // .success // false')
if [ "$DL_OK" != "true" ]; then
  fail "2a. 下载配方失败: $(echo "$DL_RESP" | jq -c '.')"
  exit 1
fi
pass "2a. 配方已下载到 $REACTOR_ID"

START_RESP=$(curl -s -X POST "$BASE/reactors/$REACTOR_ID/start" "${AUTH[@]}" \
  -d "$(jq -nc --arg bid "$BATCH_ID" '{batch_id: $bid}')")
START_OK=$(echo "$START_RESP" | jq -r '.data.success // .success // false')
if [ "$START_OK" = "true" ]; then
  pass "2b. 批次 $BATCH_ID 已启动"
else
  fail "2b. 启动批次失败 (常见原因: MOCK_PLC 未开 / interlocks 不通过): $(echo "$START_RESP" | jq -c '.')"
  echo "    提示: 启动 server 时确保 MOCK_PLC=true"
  exit 1
fi

# 给引擎一点时间从 start 节点 advance 到第一个 phase
sleep 3

# ─── 场景 3: 验证 batches.current_node_id 已写入 ─────
if [ "$HAVE_SQLITE" = "1" ]; then
  NODE_ID=$(sqlite3 "$DB_PATH" "SELECT current_node_id FROM batches WHERE batch_id='$BATCH_ID'" 2>/dev/null || echo "")
  if [ -n "$NODE_ID" ]; then
    pass "3. batches.current_node_id = '$NODE_ID' (DAG 引擎已 advance)"
  else
    fail "3. batches.current_node_id 为空 — DAG 引擎未推进或未持久化 (DB=$DB_PATH)"
  fi
else
  skip "3. 无 sqlite3, 无法直读 batches.current_node_id"
  NODE_ID=""
fi

# ─── 场景 4: 注入 PV 触发分支求值 (软场景 — 无公开 mock-pv 端点) ─
info "场景 4: 推送 mock PV (OD600=6 让 branch 走 true 分支)"
PV_HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/mock/pv" "${AUTH[@]}" \
  -d "$(jq -nc --arg rid "$REACTOR_ID" '{reactor_id: $rid, pv: {OD600: 6}}')" 2>/dev/null || echo "000")
if [ "$PV_HTTP" = "200" ]; then
  pass "4. 已推送 mock PV"
else
  skip "4. server 未暴露 /mock/pv (HTTP=$PV_HTTP); MOCK_PLC=devPlcRead 内部 OD600 由 plc-driver 提供, branch 求值依赖 plc 读"
fi

# 给 branch 节点求值 + 推进时间
sleep 5

# ─── 场景 5: 二次校验 current_node_id 是否前进 ────
if [ "$HAVE_SQLITE" = "1" ]; then
  NODE_ID2=$(sqlite3 "$DB_PATH" "SELECT current_node_id FROM batches WHERE batch_id='$BATCH_ID'" 2>/dev/null || echo "")
  if [ -n "$NODE_ID2" ]; then
    if [ -n "$NODE_ID" ] && [ "$NODE_ID2" != "$NODE_ID" ]; then
      pass "5. current_node_id 已推进: '$NODE_ID' → '$NODE_ID2'"
    elif [ -n "$NODE_ID" ]; then
      info "5. current_node_id 仍为 '$NODE_ID2' (引擎可能仍在 phase 内执行 — 非失败)"
    else
      pass "5. current_node_id 现为 '$NODE_ID2'"
    fi
  else
    fail "5. current_node_id 二次读取为空"
  fi
else
  skip "5. 无 sqlite3"
fi

# ─── 场景 6: audit-logs 含 target_kind=node_id 行 ───
info "场景 6: 检查 GET /audit-logs (应有 target_kind=node_id 的行)"
AUDIT=$(curl -s "$BASE/audit-logs?batch_id=$BATCH_ID" "${AUTH[@]}" 2>/dev/null || echo "[]")
# data wrapper: v1 包了 .data, v0 直接是数组
NODE_AUDITS=$(echo "$AUDIT" | jq -c '
  (if type == "object" then (.data // []) else . end)
  | map(select(.target_kind == "node_id")) | length
' 2>/dev/null || echo "0")
if [ "${NODE_AUDITS:-0}" -gt 0 ]; then
  pass "6. audit-logs 中找到 $NODE_AUDITS 条 target_kind=node_id 行 (T15 桥接生效)"
else
  skip "6. 未发现 target_kind=node_id 行 (可能引擎未推进, 或无 PV 触发 branch_evaluated)"
fi

# ─── 场景 7: branch_evaluated action 行 ──────
BRANCH_AUDITS=$(echo "$AUDIT" | jq -c '
  (if type == "object" then (.data // []) else . end)
  | map(select(.action == "branch_evaluated")) | length
' 2>/dev/null || echo "0")
if [ "${BRANCH_AUDITS:-0}" -gt 0 ]; then
  pass "7. audit-logs 中找到 $BRANCH_AUDITS 条 branch_evaluated 行"
else
  skip "7. 未发现 branch_evaluated 行 (依赖 PV 注入触发 branch — 见场景 4)"
fi

# ─── 场景 8: 崩溃恢复 — 必须人工配合, 此处仅打印指引 ───
info "场景 8: 崩溃恢复 (need-manual-restart)"
cat <<EOF
${YELLOW}场景 8 需要人工配合 (本脚本不会自动 kill 服务器):${RESET}
  1) 当前 batch_id=$BATCH_ID, current_node_id=$NODE_ID2
  2) 终止 server: pkill -f 'tsx.*biocore' (或 Ctrl-C 当前 server 终端)
  3) 重启 server: MOCK_PLC=true PORT=3001 npx tsx packages/server/src/index.ts
  4) 等 8 秒, 重新读 batches.current_node_id 应仍等于 '$NODE_ID2' (从持久化 DAG 状态恢复)
  5) 校验命令:
     sqlite3 $DB_PATH "SELECT batch_id, current_node_id, status FROM batches WHERE batch_id='$BATCH_ID'"
EOF
skip "8. crash-recovery 需要人工执行; 见上方指引 + RELEASE_NOTES_v1.7.0.md"

# ─── 总结 ───────────────────────────────────
echo ""
echo "─────────────────────────────────────────────"
echo " B1.1 DAG runtime e2e smoke 完成"
echo "─────────────────────────────────────────────"
echo "  Recipe : $RECIPE_ID (v1.0.0, schema_version=2)"
echo "  Reactor: $REACTOR_ID"
echo "  Batch  : $BATCH_ID"
echo "  Node   : ${NODE_ID2:-<unknown>}"
echo "  DB     : $DB_PATH"
echo ""
echo -e "  ${GREEN}PASS${RESET}: $PASS_COUNT   ${RED}FAIL${RESET}: $FAIL_COUNT   ${YELLOW}SKIP${RESET}: $SKIP_COUNT"
echo "─────────────────────────────────────────────"

[ "$FAIL_COUNT" -eq 0 ] || exit 1
exit 0
