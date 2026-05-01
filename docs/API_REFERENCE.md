# BIOCore API 完整参考手册

> **版本**: v1.0 (Sprint 1 完成版)
> **基础 URL**: `http://localhost:3001` (开发) / `https://biocore.example.com` (生产)
> **97 个端点,10 个模块**
> **交互式文档**: `http://<host>:3001/api/v1/docs/`

---

## 目录

1. [认证与通用规范](#1-认证与通用规范)
2. [模块总览](#2-模块总览)
3. [认证 Auth](#3-认证-auth) — 3 端点
4. [用户管理 Users](#4-用户管理-users) — 4 端点
5. [API 密钥 API Keys](#5-api-密钥-api-keys) — 5 端点(Sprint 1 新增)
6. [反应器运行时 Reactors](#6-反应器运行时-reactors) — 17 端点
7. [设备配置 Reactor Configs](#7-设备配置-reactor-configs) — 6 端点
8. [PLC 通讯 PLC](#8-plc-通讯-plc) — 13 端点
9. [配方 Recipes](#9-配方-recipes) — 6 端点
10. [Phase 模板 Phase Templates](#10-phase-模板-phase-templates) — 6 端点
11. [批次与报告 Batches](#11-批次与报告-batches) — 9 端点
12. [报警 Alarms](#12-报警-alarms) — 2 端点
13. [审计日志 Audit](#13-审计日志-audit) — 2 端点
14. [趋势历史 Trends](#14-趋势历史-trends) — 1 端点
15. [离线取样 Offline Samples](#15-离线取样-offline-samples) — 2 端点
16. [传感器校准 Calibrations](#16-传感器校准-calibrations) — 2 端点
17. [AI 与建议 AI](#17-ai-与建议-ai) — 6 端点
18. [软测量 Soft Sensor](#18-软测量-soft-sensor) — 4 端点
19. [根因分析 & 补料建议](#19-根因分析--补料建议) — 2 端点
20. [实验优化 Experiment](#20-实验优化-experiment) — 2 端点
21. [系统设置 Settings](#21-系统设置-settings) — 5 端点
22. [状态 & 健康检查](#22-状态--健康检查) — 1 端点
23. [WebSocket 实时数据](#23-websocket-实时数据)
24. [错误码与排错](#24-错误码与排错)

---

## 1. 认证与通用规范

### 1.1 两种鉴权方式

| 方式 | Header 格式 | 用途 | 过期 |
|---|---|---|---|
| **JWT** | `Authorization: Bearer <token>` | 前端 UI (浏览器登录) | 24h |
| **API Key** | `X-API-Key: ak_xxx.yyyyy` | MES/CRM 外部系统 | 长期有效,可撤销 |

**获取 JWT**:
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

**获取 API Key**: 登录 biocore UI → `/settings/api-keys` → 创建。

### 1.2 路径版本化

| 路径前缀 | 状态 | 响应格式 |
|---|---|---|
| `/api/v1/*` | **推荐** | 统一 `{code, msg, data, trace_id}` |
| `/api/*` | 已废弃(到 **2026-10-05**) | 原对象格式,每次调用返回 `Deprecation` header |

### 1.3 统一响应格式(仅 v1)

**成功响应**:
```json
{
  "code": 0,
  "msg": "ok",
  "data": { ... },
  "trace_id": "aa3029adbfdf68c5"
}
```

**错误响应**:
```json
{
  "code": 404,
  "msg": "反应器 nonexistent 不存在",
  "data": null,
  "trace_id": "5c1c30e162227fc4"
}
```

### 1.4 trace_id 跨系统追踪

客户端可通过 `X-Trace-Id` header 主动传入(16 字符内,仅 `[a-zA-Z0-9_-]`),biocore 会原样透传到响应头 + body + audit_logs。

```bash
curl -H 'X-Trace-Id: mes-req-12345' http://localhost:3001/api/v1/reactors
# 响应 header: X-Trace-Id: mes-req-12345
# body: {"code":0,"data":[...],"trace_id":"mes-req-12345"}
```

### 1.5 HTTP 状态码

| Code | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权(token 缺失/过期/无效) |
| 403 | 权限不足(角色不够) |
| 404 | 资源不存在 |
| 409 | 冲突(例如用户名已存在) |
| 500 | 服务端内部错误 |
| 503 | 依赖服务不可用(InfluxDB 未配置) |

---

## 2. 模块总览

| 模块 | 端点数 | 主要功能 |
|---|---|---|
| 认证 Auth | 3 | 登录/Token 验证 |
| 用户管理 | 4 | 用户 CRUD,角色管理 |
| API 密钥 | 5 | 外部系统鉴权凭证 |
| 反应器运行时 | 17 | 多反应器批次控制 |
| 设备配置 | 6 | 反应器物理配置 |
| PLC 通讯 | 13 | PLC 连接/变量/心跳 |
| 配方 | 6 | 配方 CRUD / 锁定 |
| Phase 模板 | 6 | 14 种 Phase 配置 |
| 批次与报告 | 9 | 批次查询/导出 |
| 报警 | 2 | 报警列表/确认 |
| 审计日志 | 2 | 不可篡改操作记录 |
| 趋势历史 | 1 | InfluxDB 时序查询 |
| 离线取样 | 2 | 离线 HPLC/OD 数据 |
| 传感器校准 | 2 | 两点线性校准 |
| AI 与建议 | 6 | 本地 LLM + 建议缓冲区 |
| 软测量 | 4 | ONNX 模型推断 |
| 根因分析 + 补料建议 | 2 | AI 辅助决策 |
| 实验优化 | 2 | 贝叶斯优化 |
| 系统设置 | 5 | AI/数据维护配置 |
| 状态 | 1 | 健康检查 |
| **合计** | **~97** | |

---

## 3. 认证 Auth

### `POST /api/v1/auth/login` — 登录

**Public**(无需鉴权)

请求体:
```json
{ "username": "admin", "password": "admin123" }
```

响应(200):
```json
{
  "code": 0, "msg": "ok", "trace_id": "...",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "user_id": "admin-001",
      "username": "admin",
      "display_name": "系统管理员",
      "role": "admin"
    }
  }
}
```

错误:
- `400` 缺少用户名或密码
- `401` 用户名或密码错误

### `GET /api/v1/auth/me` — 当前用户

返回当前请求 user 对象(JWT 解码后的 payload 或 API Key 身份)。

---

## 4. 用户管理 Users

### `GET /api/v1/users` — 列出所有用户
返回 `{user_id, username, display_name, role, created_at, last_login_at, is_active}[]`

### `POST /api/v1/users` — 创建用户

请求体:
```json
{
  "username": "operator1",
  "display_name": "操作员 1",
  "password": "xxxx",
  "role": "operator"  // admin | engineer | operator | viewer
}
```

### `PUT /api/v1/users/:id` — 更新用户
可更新 `display_name`、`role`、`is_active`、`password`(可选)。

### `DELETE /api/v1/users/:id` — 删除用户
`admin-001` 不可删除。

---

## 5. API 密钥 API Keys

> **Sprint 1 新增**。供 MES/外部系统获取长期调用凭证。

### `GET /api/v1/api-keys` — 列出当前用户创建的 keys
返回(不含 raw key):
```json
{
  "data": [{
    "key_id": "ak_867b1483b82d25d8",
    "name": "mes-prod",
    "scopes": "read:* write:*",
    "created_at": "2026-04-08 02:21:09",
    "last_used_at": "2026-04-08 02:30:15",
    "revoked": 0
  }]
}
```

### `POST /api/v1/api-keys` — 创建新 key

请求体: `{"name": "mes-prod"}`

响应(**raw key 仅此一次返回**):
```json
{
  "data": {
    "keyId": "ak_867b1483b82d25d8",
    "rawKey": "ak_867b1483b82d25d8.NQ9qE8xZ...",
    "name": "mes-prod",
    "scopes": "read:* write:*",
    "warning": "此 raw key 只显示一次, 关闭后无法找回, 请立即复制保存"
  }
}
```

### `DELETE /api/v1/api-keys/:id` — 撤销 key
软删除(`revoked=1`,保留审计追溯)。

### `POST /api/v1/api-keys/:id/rotate` — 轮换 key
撤销旧 key + 创建新 key(复用 name/scopes),返回新 raw key 一次。

### `GET /api/v1/api-keys/:id/usage` — 使用情况
返回 `last_used_at` + 最近 100 条 audit_logs 记录。

---

## 6. 反应器运行时 Reactors

> 这是 biocore 最核心的模块,提供多反应器批次控制。

### `GET /api/v1/reactors` — 列出运行时反应器
返回 `{id, state, batchId}[]`。

### `GET /api/v1/reactors/:id/status` — 单反应器完整状态
返回 XState 快照含 phase_index/step_number/buttons/phase_statuses 等。

### `POST /api/v1/reactors` — 注册反应器

请求体: `{"reactorId": "Reactor-1"}`

### `DELETE /api/v1/reactors/:id` — 注销反应器

### `POST /api/v1/reactors/:id/download-recipe` — 下载配方

请求体: `{"recipe_id": "ECOLI_V1", "version": "1.0.0"}`

> 配方必须 `status=approved` 才能下载。下载成功后 broadcast `recipe_downloaded` WS 事件。

### `GET /api/v1/reactors/:id/recipe` — 查看已下载配方

### `POST /api/v1/reactors/:id/start` — 启动批次
请求体: `{"batch_id": "BATCH-20260408-001"}`(可选)

### 批次状态控制(ISA-88 六状态)

| 端点 | 从状态 | 到状态 | 说明 |
|---|---|---|---|
| `POST /reactors/:id/pause` | running | paused | 操作员手动暂停 |
| `POST /reactors/:id/unpause` | paused | running | 操作员恢复 |
| `POST /reactors/:id/hold` | running | held | 故障 Hold(一般由故障检测器触发) |
| `POST /reactors/:id/restart` | held | running | 恢复到 Hold 前的 Step |
| `POST /reactors/:id/stop` | paused/held | stopped | 停止批次 |
| `POST /reactors/:id/estop` | 任意 | stopped | 紧急停止(尽量用 PLC 硬急停) |
| `POST /reactors/:id/reset` | stopped/complete | idle | 复位准备下一批 |

> **约束**: `running` 状态不能直接 `stop`,必须先 `pause`。

### Phase 级控制

| 端点 | 说明 |
|---|---|
| `GET /reactors/:reactorId/phases` | 列出所有 Phase 状态 |
| `POST /reactors/:reactorId/phases/:phaseIndex/start` | 手动启动某 Phase(自由模式) |
| `POST /reactors/:reactorId/phases/:phaseIndex/hold` | Hold 某 Phase |
| `POST /reactors/:reactorId/phases/:phaseIndex/skip` | 跳过某 Phase |
| `POST /reactors/:reactorId/phases/:phaseIndex/restart` | 重启某 Phase |

---

## 7. 设备配置 Reactor Configs

> 反应器的"物理静态"配置(跟运行时状态分离)。

### `GET /api/v1/reactor-configs` — 列出设备
返回 `{reactor_id, name, vessel_volume_L, plc_connection_id, enabled, sort_order}[]`

### `GET /api/v1/reactor-configs/:id` — 单设备详情

### `POST /api/v1/reactor-configs` — 创建设备

请求体:
```json
{
  "reactor_id": "Reactor-1",
  "name": "发酵罐 #1",
  "description": "5L 研发罐",
  "vessel_volume_L": 5,
  "plc_connection_id": "abc-123",
  "enabled": 1
}
```

### `PUT /api/v1/reactor-configs/:id` — 更新

### `DELETE /api/v1/reactor-configs/:id` — 删除

### `POST /api/v1/reactor-configs/init-defaults` — 初始化 3 个默认反应器

---

## 8. PLC 通讯 PLC

### 8.1 PLC 连接管理

| 端点 | 说明 |
|---|---|
| `GET /plc/connections` | 列出连接 |
| `POST /plc/connections` | 创建 |
| `PUT /plc/connections/:id` | 更新 |
| `DELETE /plc/connections/:id` | 删除 |
| `POST /plc/connections/:id/test` | 测试连接可达性 |

连接体示例(S7 协议):
```json
{
  "id": "biocore-plc-1",
  "name": "主发酵罐 PLC",
  "protocol": "s7",
  "ip": "192.168.2.1",
  "port": 102,
  "rack": 0,
  "slot": 1,
  "s7_db": 2,
  "heartbeat_write_address": "VB400",
  "heartbeat_read_address": "VB401",
  "enabled": true
}
```

### 8.2 心跳控制

| 端点 | 说明 |
|---|---|
| `POST /plc/connections/:id/heartbeat/start` | 启动心跳任务(1Hz 写入计数器) |
| `POST /plc/connections/:id/heartbeat/stop` | 停止心跳 |
| `GET /plc/connections/:id/heartbeat/status` | 心跳当前状态 `{running, counter, errors}` |

### 8.3 PLC 变量 CRUD

| 端点 | 说明 |
|---|---|
| `GET /plc/variables?connection_id=xxx` | 列出变量 |
| `POST /plc/variables` | 创建变量 |
| `PUT /plc/variables/:id` | 更新 |
| `PUT /plc/variables` | **批量 upsert**(供模板导入使用) |
| `DELETE /plc/variables/:id` | 删除 |
| `POST /plc/variables/:id/test` | 读取变量实际值 |

变量体示例:
```json
{
  "id": "uuid",
  "connection_id": "biocore-plc-1",
  "tag_name": "TEMP_PV",
  "description": "罐内温度",
  "plc_address": "VW100",
  "data_type": "INT16",
  "direction": "READ",
  "scaling_enabled": true,
  "raw_min": 0, "raw_max": 27648,
  "eng_min": 0, "eng_max": 150,
  "eng_unit": "°C",
  "group": "模拟量输入",
  "poll_rate_ms": 1000,
  "enabled": true
}
```

### 8.4 导入/导出

| 端点 | 说明 |
|---|---|
| `GET /plc/export/json` | 导出所有变量为 JSON 文件 |
| `GET /plc/export/csv` | 导出为 CSV |
| `POST /plc/import/json` | 批量导入 JSON |

---

## 9. 配方 Recipes

### `GET /api/v1/recipes?status=approved` — 列出配方
`status` 可选: `draft` / `approved` / `archived` / `superseded`

### `GET /api/v1/recipes/:id?version=1.0.0` — 获取单个配方

### `POST /api/v1/recipes` — 创建或更新配方

请求体包含完整配方 JSON(见 `docs/04_配方JSON规范.md`):
```json
{
  "recipe_id": "ECOLI_V1",
  "version": "1.0.0",
  "name": "E.coli 高密度培养",
  "author": "admin",
  "target_organism": "E.coli BL21",
  "execution_mode": "sequential",
  "phases": [
    { "type": "Prepare", "params": { ... } },
    { "type": "SIP", "params": { ... } },
    { "type": "Fermentation", "params": { "duration_h": 24, ... } }
  ]
}
```

### `POST /api/v1/recipes/:id/approve` — 批准配方
草稿 → approved(锁定后可下载)。

### `POST /api/v1/recipes/:id/status` — 变更状态

请求体: `{"version": "1.0.0", "status": "archived"}`

### `DELETE /api/v1/recipes/:id?version=1.0.0` — 删除配方(仅 draft)

---

## 10. Phase 模板 Phase Templates

> 14 种内置 Phase 类型的可配置模板(Step 序列、PLC 参数绑定、完成条件)。

### `GET /api/v1/phase-templates` — 列出所有模板
### `GET /api/v1/phase-templates/:type` — 单模板详情
### `POST /api/v1/phase-templates` — 创建
### `PUT /api/v1/phase-templates/:type` — 更新
### `DELETE /api/v1/phase-templates/:type` — 删除(不可删 is_system=1)
### `POST /api/v1/phase-templates/init-defaults?force=true` — 初始化内置 14 种 Phase 模板

**14 种 Phase 类型**:
`Prepare` / `AddWater` / `ManualAdd` / `Heating` / `TempControl` / `Agitation` / `Feeding` / `PHControl` / `DOControl` / `Aeration` / `Discharge` / `Fermentation` / `SIP` / `CIP`

---

## 11. 批次与报告 Batches

### `GET /api/v1/batches?limit=50&offset=0` — 列出批次
### `GET /api/v1/batches/:id` — 单批次详情
### `GET /api/v1/batches/:id/transitions` — 状态流转日志
### `GET /api/v1/batches/:id/phases` — Phase 执行历史
### `GET /api/v1/batches/:id/steps` — Step 执行历史
### `GET /api/v1/batches/:id/samples` — 离线取样数据
### `GET /api/v1/batches/:id/report` — 完整批次报告(JSON)
### `GET /api/v1/batches/:id/export/csv` — 导出 CSV
### `POST /api/v1/batches/:id/generate-summary` — AI 生成批次摘要

---

## 12. 报警 Alarms

### `GET /api/v1/alarms` — 列出报警

### `POST /api/v1/alarms/:id/acknowledge` — 确认报警
请求体: `{"user_id": "admin"}`

---

## 13. 审计日志 Audit

> **不可篡改**:SQLite 触发器禁止 UPDATE/DELETE。

### `GET /api/v1/audit-logs?batch_id=xxx&limit=100` — 查询
返回字段: `id, batch_id, user_id, action, target_type, target_id, old_value, new_value, reason, ip_address, trace_id, timestamp`

### `POST /api/v1/audit-logs` — 写入审计
请求体:
```json
{
  "batch_id": "BATCH-001",
  "user_id": "admin",
  "action": "param_change",
  "target_type": "reactor",
  "target_id": "Reactor-1",
  "old_value": "37",
  "new_value": "38",
  "reason": "工艺优化"
}
```

> **Sprint 1 新增**:若请求带 `X-Trace-Id` header,会自动写入 `trace_id` 字段;`ip_address` 从 `req.ip` 自动填充。

---

## 14. 趋势历史 Trends

### `GET /api/v1/trends` — 查询时序数据

查询参数:
| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `reactor_id` | ✓ | — | 反应器 ID |
| `fields` | — | `temperature,pH,DO` | 逗号分隔字段 |
| `start` | — | `-1h` | Flux 时间范围 |
| `stop` | — | `now()` | Flux 结束时间 |

**合法字段白名单**: `temperature`, `jacket_temp`, `pH`, `DO`, `pressure`, `airflow`, `weight`, `rpm`, `vfd_current`

**合法时间格式**: `-<数字>[smhdw]`(例 `-24h`,`-30m`,`-7d`) 或 `now()`

示例:
```bash
curl 'http://localhost:3001/api/v1/trends?reactor_id=Reactor-1&fields=temperature,pH,DO&start=-24h&stop=now()' \
  -H "Authorization: Bearer $TOKEN"
```

响应:
```json
{
  "data": {
    "reactor_id": "Reactor-1",
    "fields": ["temperature", "pH", "DO"],
    "start": "-24h",
    "stop": "now()",
    "count": 1440,
    "data": [
      { "_time": "2026-04-07T15:45:22Z", "temperature": 36.81, "pH": 7.01, "DO": 60.05 },
      ...
    ]
  }
}
```

---

## 15. 离线取样 Offline Samples

### `GET /api/v1/batches/:id/samples` — 列出离线取样
### `POST /api/v1/batches/:id/samples` — 添加取样

请求体:
```json
{
  "sample_time": "2026-04-08T10:00:00Z",
  "elapsed_h": 8.5,
  "od600": 12.5,
  "dcw_g_L": 4.2,
  "glucose_g_L": 0.5,
  "acetate_g_L": 1.2,
  "product_titer": 3.8,
  "product_unit": "g/L",
  "sampled_by": "operator1"
}
```

---

## 16. 传感器校准 Calibrations

### `GET /api/v1/calibrations/:channel` — 查询最新校准

### `POST /api/v1/calibrations` — 保存校准

请求体(两点线性):
```json
{
  "channel": "AI-2",
  "sensor_type": "pH",
  "calibrated_by": "admin",
  "cal_point_low_raw": 0,
  "cal_point_low_eng": 4.0,
  "cal_point_high_raw": 27648,
  "cal_point_high_eng": 10.0
}
```

---

## 17. AI 与建议 AI

### `GET /api/v1/ai/status` — Ollama 状态
返回 `{available, models}`

### `POST /api/v1/ai/chat` — AI 对话

请求体: `{"messages": [...], "batch_id": "xxx"}`

### `POST /api/v1/ai/nl-to-flux` — 自然语言 → Flux 查询

请求体: `{"question": "最近 1 小时 Reactor-1 的平均温度"}`

### `GET /api/v1/ai/suggestions?batch_id=xxx&status=pending` — 列出 AI 建议

### `POST /api/v1/ai/suggestions/:id/accept` — 采纳建议

### `POST /api/v1/ai/suggestions/:id/reject` — 拒绝建议

> **关键约束**: AI 永远不能直接写入 PLC,必须经"建议缓冲区"→ 操作员确认。

---

## 18. 软测量 Soft Sensor

### `GET /api/v1/soft-sensor/models` — 列出已训练模型
### `POST /api/v1/soft-sensor/predict` — 软测量推断
请求体: `{"model_id": "...", "features": {...}}`
### `POST /api/v1/soft-sensor/train` — 训练新模型
### `DELETE /api/v1/soft-sensor/models/:id` — 删除模型

---

## 19. 根因分析 & 补料建议

### `POST /api/v1/root-cause/analyze` — 根因分析
请求体: `{"batch_id": "xxx", "symptom": "温度异常"}`

### `POST /api/v1/feed-advisor/recommend` — 补料建议
请求体: `{"batch_id": "xxx", "current_state": {...}}`

---

## 20. 实验优化 Experiment

### `GET /api/v1/experiment/history` — 历史实验数据
### `POST /api/v1/experiment/recommend` — 贝叶斯优化推荐参数

---

## 21. 系统设置 Settings

### `GET /api/v1/settings/ai` — AI 配置
### `PUT /api/v1/settings/ai` — 更新 AI 配置(含 Ollama URL / 云端 API key)

### `GET /api/v1/settings/data-maintenance` — 数据维护配置
### `PUT /api/v1/settings/data-maintenance` — 更新(含自动备份/保留策略)
### `POST /api/v1/settings/data-maintenance/backup` — 立即备份
### `POST /api/v1/settings/data-maintenance/cleanup` — 清理过期日志

---

## 22. 状态 & 健康检查

### `GET /api/v1/status` — **Public**(无需鉴权)

返回:
```json
{
  "data": {
    "version": "0.1.0",
    "uptime": 1234.5,
    "ws_clients": 2,
    "heartbeats": [
      {"id": "plc-1", "running": true, "counter": 1234, "errors": 0}
    ]
  }
}
```

适合 Kubernetes liveness/readiness probe。

---

## 23. WebSocket 实时数据

### 连接

```
ws://localhost:3001/ws?token=<JWT>
ws://localhost:3001/ws?api_key=<rawKey>
```

详见 [WS_PROTOCOL.md](./WS_PROTOCOL.md)。

### Channel 列表(10 种)

| Channel | 触发 | 频率 |
|---|---|---|
| `pv_realtime` | Collector 采集 | 1 Hz |
| `state_update` | 反应器状态变化 | 事件驱动 |
| `step_progress` | Step 完成/Phase 事件 | 事件驱动 |
| `recipe_downloaded` | 配方下载到反应器 | 事件驱动 |
| `alarm` | 新报警 | 事件驱动 |
| `heartbeat` | PLC 心跳 | 1 Hz |
| `calculated` | 软件测算值(OUR/kLa/μ) | 1/min |
| `cusum` | CUSUM 异常告警 | 事件驱动 |
| `ai_suggestion` | AI 新建议 | 事件驱动 |
| `soft_sensor` | ONNX 推断结果 | 事件驱动 |

### Close codes

| Code | 含义 | 客户端处理 |
|---|---|---|
| 1000 | 正常关闭 | 不重连 |
| **1008** | **Unauthorized** | 重新登录后再连 |
| 1011 | 服务端错误 | 退避重试 |
| 1006 | 网络异常 | 指数退避重连 |
| 1001 | 服务端优雅关闭(SIGTERM) | 退避重试 |

---

## 24. 错误码与排错

### 24.1 常见错误对照

| 场景 | HTTP | msg 关键字 | 排查方向 |
|---|---|---|---|
| 无 token 访问 | 401 | `未授权: 请提供 Authorization Bearer token` | 登录获取 JWT 或配 API Key |
| Token 过期 | 401 | `Token 无效或已过期` | 重新登录 |
| API Key 被撤销 | 401 | `API Key 无效或已撤销` | 创建新 key |
| 反应器不存在 | 404 | `反应器 xxx 不存在` | 先 POST /reactors 注册 |
| 配方未锁定不能下载 | 400 | `配方 xxx status=draft 不可下载` | POST /recipes/:id/approve |
| running 状态不能直接 stop | 400 | `当前状态 running 不允许 stop,请先 pause` | 先 pause |
| PLC 未连接(MOCK_PLC=false) | 500 | `PLC 未连接, 无法读取 xxx` | 配置 PLC 或设 MOCK_PLC=true |
| InfluxDB 未配置 | 503 | `InfluxDB 未配置, 无法查询历史数据` | 设置 INFLUX_TOKEN |
| 字段名非法 | 400 | `没有合法字段` | 检查白名单 |

### 24.2 trace_id 排错

MES 调用 biocore 时提供 `X-Trace-Id`,biocore 会:
1. 在响应头 `X-Trace-Id` 返回
2. 在 `audit_logs.trace_id` 字段写入
3. 在所有 server console 日志中带上(Sprint 2 计划)

MES 报错时把 trace_id 提供给 biocore 运维,即可定位具体请求链。

### 24.3 Deprecation header 解读

旧 `/api/*` 路径响应会含:
```
Deprecation: version="v0", sunset="2026-10-05"
Link: </api/v1/xxx>; rel="successor-version"
```

MES 集成方应按 Link 中的 `successor-version` 逐步迁移到 v1 路径。

---

## 附录 A — 快速开始脚本

```bash
#!/bin/bash
# MES 集成示例

BIOCORE_HOST="http://localhost:3001"
API_KEY="ak_xxx.yyyyy"  # 从 /settings/api-keys 创建

# 1. 列出反应器
curl -sS "$BIOCORE_HOST/api/v1/reactors" \
  -H "X-API-Key: $API_KEY" \
  -H "X-Trace-Id: mes-query-001"

# 2. 下载配方
curl -sS -X POST "$BIOCORE_HOST/api/v1/reactors/Reactor-1/download-recipe" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"recipe_id":"ECOLI_V1","version":"1.0.0"}'

# 3. 启动批次
curl -sS -X POST "$BIOCORE_HOST/api/v1/reactors/Reactor-1/start" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"MES-BATCH-20260408-001"}'

# 4. 查询趋势
curl -sS "$BIOCORE_HOST/api/v1/trends?reactor_id=Reactor-1&fields=temperature,pH,DO&start=-1h" \
  -H "X-API-Key: $API_KEY"
```

## 附录 B — 相关文档

- [WS_PROTOCOL.md](./WS_PROTOCOL.md) — WebSocket 协议详解
- [API_INTEGRATION.md](./API_INTEGRATION.md) — MES 集成指南
- [部署说明.md](./部署说明.md) — 生产部署 checklist
- [PRODUCT_OVERVIEW.md](./PRODUCT_OVERVIEW.md) — 产品功能介绍
- 交互式 Swagger UI: `http://localhost:3001/api/v1/docs/`
- OpenAPI JSON: `http://localhost:3001/api/v1/docs.json`

---

**文档版本**: v1.0
**生成日期**: 2026-04-08
**对应代码版本**: BIOCore Sprint 1 完成版
