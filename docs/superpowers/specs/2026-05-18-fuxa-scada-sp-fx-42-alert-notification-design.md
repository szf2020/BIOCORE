# SP-FX-42 Alert Notification System — 设计规范

**Sprint**: SP-FX-42  
**日期**: 2026-05-18  
**状态**: APPROVED

---

## 1. 背景

BIOCore 现有 audit_log / write-intent / scada 表已积累操作数据，但无告警推送机制。操作员需要在以下场景收到通知：

- threshold breach（阈值越界）
- write-intent reject（写意图被拒绝）
- system error（系统错误）

本 sprint 实现完整的告警规则引擎 + 渠道分发系统。

---

## 2. 约束

- **ZERO 新第三方 dep** — Slack/webhook 用 native `fetch`；SMTP 用 stub（真实 SMTP 留 future）
- **Alert 仅通知，不触发 PLC** — AI/animation 永不直写 PLC
- **writeTag opts.confirmed===true 严格 gate** — 不可绕过
- **不破 animation-engine T8 安全 invariant**
- **Baseline server 252 / web-ui 1157；期望 server +15-18，web-ui +8-10**

---

## 3. 数据模型

### 3.1 alert_channels

```sql
CREATE TABLE alert_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK(type IN ('slack','email','webhook')),
  name        TEXT NOT NULL,
  config      TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

config JSON 结构（按 type）:
- slack: `{"url":"https://hooks.slack.com/..."}`
- email: `{"recipients":["ops@example.com"]}`
- webhook: `{"url":"https://example.com/hook","method":"POST"}`

### 3.2 alert_rules

```sql
CREATE TABLE alert_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  trigger_type    TEXT NOT NULL CHECK(trigger_type IN ('audit_log','write_intent_reject','system_error','threshold')),
  condition_expr  TEXT NOT NULL,
  channel_id      INTEGER NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

condition_expr 示例: `"value > 80"`, `"action == 'DELETE'"`, `"true"`

### 3.3 alert_history

```sql
CREATE TABLE alert_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  fired_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  payload     TEXT NOT NULL,
  delivered   INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0
);
```

---

## 4. API 设计

所有接口挂载于 `/api/v1/alerts/*`，全 admin only。

| Method | Path | 说明 |
|--------|------|------|
| GET | /alerts/rules | 列所有规则 |
| POST | /alerts/rules | 新建规则 |
| PUT | /alerts/rules/:id | 更新规则 |
| DELETE | /alerts/rules/:id | 删除规则 |
| GET | /alerts/channels | 列所有渠道 |
| POST | /alerts/channels | 新建渠道 |
| PUT | /alerts/channels/:id | 更新渠道 |
| DELETE | /alerts/channels/:id | 删除渠道 |
| GET | /alerts/history?limit=100 | 列历史 |
| POST | /alerts/test/:channelId | 测试发送 |

---

## 5. Alert Dispatcher 服务

### 5.1 架构

```
AlertDispatcher
├── evaluateCondition(expr, context) → boolean
├── fire(ruleId, payload) → void
├── SlackAdapter.send(config, message) → Promise<boolean>
├── EmailAdapter.send(config, message) → Promise<boolean>  [stub]
└── WebhookAdapter.send(config, message) → Promise<boolean>
```

### 5.2 触发源钩子

- audit_log insert → `trigger_type='audit_log'`
- write-intent reject → `trigger_type='write_intent_reject'`
- server error → `trigger_type='system_error'`

### 5.3 Retry 逻辑

失败 3 次后 `delivered=false, retry_count=3`。

---

## 6. Web-UI 页面

路由: `/scada2/alerts`，admin only。

三 Tab: Rules / Channels / History。各 tab 含 列表 + 新建/编辑/删除 modal。

---

## 7. 安全

- 全接口 `requireRole('admin')` 门控
- condition_expr 沙盒 eval（仅数学/比较表达式）
- 告警仅通知，不触发 PLC
