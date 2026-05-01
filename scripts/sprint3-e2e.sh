#!/usr/bin/env bash
# BIOCore Sprint 3 — 配方工作流端到端验证脚本
# 用途: 覆盖 M3.1–M3.3 + M3.10 的 10 个场景(版本化、审批、模板、审计)
# 依赖: bash + jq + curl; 需要 API 服务器运行在 :3001
# 用法: BIOCORE_URL=http://localhost:3001/api/v1 ./scripts/sprint3-e2e.sh

set -uo pipefail

BASE="${BIOCORE_URL:-http://localhost:3001/api/v1}"
USER_NAME="${BIOCORE_USER:-admin}"
USER_PW="${BIOCORE_PW:-admin123}"
TS="$(date +%s)"
RECIPE_A="SPRINT3_E2E_A_${TS}"
RECIPE_B="SPRINT3_E2E_B_${TS}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RESET='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0

pass() { echo -e "${GREEN}✓${RESET} $1"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo -e "${RED}✗${RESET} $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
info() { echo -e "${YELLOW}→${RESET} $1"; }

assert_eq() {
  local got="$1" want="$2" label="$3"
  if [ "$got" = "$want" ]; then pass "$label"; else fail "$label (got=$got want=$want)"; fi
}

# ─── 前置: 依赖检查 ───────────────────────────
# jq 优先用 PATH, 其次用脚本同目录的 jq.exe(Windows 无 PATH 安装时的备用)
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
alias jq_cmd=false  # 防误用
jq() { "$JQ" "$@"; }  # 统一入口

curl -s -o /dev/null "$BASE/status" || { echo "无法连接 $BASE — 服务未启动?"; exit 2; }

# ─── 前置: 登录 ────────────────────────────
info "登录 $USER_NAME"
LOGIN_RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PW\"}")
TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // .token // empty')
if [ -z "$TOKEN" ]; then
  echo "登录失败: $LOGIN_RESP"; exit 2
fi
pass "已获取 JWT token"

AUTH=( -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' )

# ─── 场景 1: 新建配方 v1.0.0 ───────────────────
scenario_1_create() {
  info "场景1: 新建配方 $RECIPE_A v1.0.0"
  local body
  body=$(jq -n --arg id "$RECIPE_A" '{
    recipe_id: $id, version: "1.0.0", name: "Sprint3 E2E A",
    author: "e2e", created_by: "e2e", target_organism: "e.coli",
    vessel_config: { reactor_type: "fermenter", volume_L: 5 },
    phases: [{ phase_id: "p1", type: "Prepare", duration_h: 1, params: { temperature: 37 } }],
    dag_schema_version: 1, is_template: 0
  }')
  local resp
  resp=$(curl -s -X POST "$BASE/recipes" "${AUTH[@]}" -d "$body")
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "创建 v1.0.0 ($(echo "$resp" | jq -r '.msg // "ok"'))"
}

# ─── 场景 2: 新版本 v1.0.1 ───────────────────
scenario_2_new_version() {
  info "场景2: 新建版本 v1.0.1(改参数触发 diff)"
  local body
  body=$(jq -n --arg id "$RECIPE_A" '{
    recipe_id: $id, version: "1.0.1", name: "Sprint3 E2E A v1.0.1",
    author: "e2e", created_by: "e2e", target_organism: "e.coli",
    vessel_config: { reactor_type: "fermenter", volume_L: 5 },
    phases: [{ phase_id: "p1", type: "Prepare", duration_h: 2, params: { temperature: 38 } }],
    dag_schema_version: 1, is_template: 0
  }')
  local resp
  resp=$(curl -s -X POST "$BASE/recipes" "${AUTH[@]}" -d "$body")
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "创建 v1.0.1 ($(echo "$resp" | jq -r '.msg // "ok"'))"
}

# ─── 场景 3: 版本历史 ───────────────────
scenario_3_versions() {
  info "场景3: 列出配方版本"
  local resp count
  resp=$(curl -s "$BASE/recipes/$RECIPE_A/versions" "${AUTH[@]}")
  count=$(echo "$resp" | jq '(.data // .) | length')
  if [ "$count" -ge 2 ]; then pass "versions 端点返回 $count 行 (≥2)"; else fail "versions 端点应 ≥2, got=$count"; fi
}

# ─── 场景 4: 版本 diff ───────────────────
scenario_4_diff() {
  info "场景4: v1.0.0 vs v1.0.1 diff"
  local resp changes
  resp=$(curl -s "$BASE/recipes/$RECIPE_A/diff?v1=1.0.0&v2=1.0.1" "${AUTH[@]}")
  changes=$(echo "$resp" | jq '((.data // .).diff // .changes // []) | length')
  if [ "$changes" -gt 0 ]; then pass "diff 端点返回 $changes 处变更"; else fail "diff 应有变更 (got=$changes)"; fi
}

# ─── 场景 5: 提交审核 ───────────────────
scenario_5_submit() {
  info "场景5: 提交 v1.0.1 进入审核"
  local resp
  resp=$(curl -s -X POST "$BASE/recipes/$RECIPE_A/submit-for-review" \
    "${AUTH[@]}" -d '{"version":"1.0.1"}')
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "submit-for-review"
}

# ─── 场景 6: 拒绝(需带 reason) ───────────────────
scenario_6_reject() {
  info "场景6: 拒绝 v1.0.1 带理由"
  local resp400 resp
  resp400=$(curl -s -X POST "$BASE/recipes/$RECIPE_A/reject" \
    "${AUTH[@]}" -d '{"version":"1.0.1"}')
  if echo "$resp400" | jq -e '.error // .msg // empty' >/dev/null; then
    pass "拒绝无 reason → 校验失败"
  else
    fail "拒绝无 reason 应被拒 (resp=$resp400)"
  fi
  resp=$(curl -s -X POST "$BASE/recipes/$RECIPE_A/reject" \
    "${AUTH[@]}" -d '{"version":"1.0.1","reason":"温度超限"}')
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "reject 带理由"
}

# ─── 场景 7: 再提交+批准 ───────────────────
scenario_7_approve() {
  info "场景7: 再次提交 → 批准"
  curl -s -X POST "$BASE/recipes/$RECIPE_A/submit-for-review" \
    "${AUTH[@]}" -d '{"version":"1.0.1"}' >/dev/null
  local resp status
  resp=$(curl -s -X POST "$BASE/recipes/$RECIPE_A/approve" \
    "${AUTH[@]}" -d '{"version":"1.0.1","approved_by":"e2e-reviewer"}')
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "approve"
  status=$(curl -s "$BASE/recipes/$RECIPE_A?version=1.0.1" "${AUTH[@]}" \
    | jq -r '(.data // .).status // "none"')
  assert_eq "$status" "approved" "配方状态=approved"
}

# ─── 场景 8: 另存为模板 ───────────────────
TEMPLATE_ID=""
scenario_8_save_template() {
  info "场景8: v1.0.1 → 另存为模板"
  local resp
  resp=$(curl -s -X POST "$BASE/recipes/$RECIPE_A/save-as-template" \
    "${AUTH[@]}" -d '{"version":"1.0.1"}')
  TEMPLATE_ID=$(echo "$resp" | jq -r '(.data // .).template_id // empty')
  if [ -n "$TEMPLATE_ID" ]; then
    pass "save-as-template 返回 template_id=$TEMPLATE_ID"
  else
    fail "save-as-template 未返回 template_id (resp=$resp)"
  fi
}

# ─── 场景 9: 从模板创建配方 B ───────────────────
scenario_9_instantiate() {
  info "场景9: 从模板创建配方 $RECIPE_B"
  if [ -z "$TEMPLATE_ID" ]; then fail "跳过 — 无 template_id"; return; fi
  local body resp parent
  body=$(jq -n --arg rid "$RECIPE_B" '{recipe_id: $rid, name: "Sprint3 E2E B"}')
  resp=$(curl -s -X POST "$BASE/recipes/from-template/$TEMPLATE_ID" \
    "${AUTH[@]}" -d "$body")
  assert_eq "$(echo "$resp" | jq -r '.data.success // .success // false')" "true" "from-template"
  parent=$(curl -s "$BASE/recipes/$RECIPE_B?version=1.0.0" "${AUTH[@]}" \
    | jq -r '(.data // .).parent_template_id // "none"')
  if [ "$parent" = "$TEMPLATE_ID" ]; then
    pass "配方 B.parent_template_id = $TEMPLATE_ID"
  else
    fail "parent_template_id 不匹配 (got=$parent want=$TEMPLATE_ID)"
  fi
}

# ─── 场景 10: 审计日志 7 类 action 全出现 ───────────────────
scenario_10_audit() {
  info "场景10: 验证审计日志覆盖 7 类 recipe action"
  local resp actions
  resp=$(curl -s "$BASE/audit-logs" "${AUTH[@]}")
  actions=$(echo "$resp" | jq -r '(.data // .)[].action' | sort -u)
  echo "$actions" | grep -q '^recipe_'

  echo "─────── recipe 审计 action 表 ───────"
  for want in recipe_create recipe_submit_review recipe_reject recipe_approve \
              recipe_save_as_template recipe_instantiate_template; do
    if echo "$actions" | grep -qx "$want"; then
      pass "$want"
    else
      fail "$want 缺失"
    fi
  done
}

# ─── 主流程 ────────────────────────────────
main() {
  scenario_1_create
  scenario_2_new_version
  scenario_3_versions
  scenario_4_diff
  scenario_5_submit
  scenario_6_reject
  scenario_7_approve
  scenario_8_save_template
  scenario_9_instantiate
  scenario_10_audit

  echo
  echo "═══════════════════════════════════════════"
  echo -e "通过: ${GREEN}$PASS_COUNT${RESET} | 失败: ${RED}$FAIL_COUNT${RESET}"
  echo "═══════════════════════════════════════════"
  [ "$FAIL_COUNT" -eq 0 ] && exit 0 || exit 1
}

main
