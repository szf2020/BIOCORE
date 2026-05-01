# BIOCore API 集成指南 (供 MES 等外部系统对接)

> Sprint 1 (2026-04) 完成的 v1 API,供 MES、CRM 等系统通过 REST + WebSocket 集成 biocore

---

## 1. 快速开始

### 1.1 申请 API Key

biocore 管理员在 `/settings/api-keys` 页面创建 API Key:
1. 输入 key 名称(例如 `mes-prod`,用于识别用途)
2. 系统生成 raw key,**只显示一次**,格式: `ak_xxx.yyyy`
3. 立即保存到你的环境变量或密钥管理器

### 1.2 第一次调用

```bash
# REST API
curl -H "X-API-Key: ak_xxx.yyyy" \
  http://biocore-host:3001/api/v1/reactors

# WebSocket
wscat -c "ws://biocore-host:3001/ws?api_key=ak_xxx.yyyy"
```

### 1.3 交互式 API 文档

浏览器访问 `http://biocore-host:3001/api/v1/docs/` 查看 Swagger UI,可直接试用所有端点。

OpenAPI spec JSON: `http://biocore-host:3001/api/v1/docs.json`(可导入 Postman/Insomnia)

---

## 2. 鉴权方式

| 方式 | Header / URL 参数 | 用途 |
|---|---|---|
| **JWT** | `Authorization: Bearer <jwt>` | 前端 UI(浏览器登录),24h 有效 |
| **API Key** | `X-API-Key: ak_xxx.yyyy` | MES/CRM 等外部系统,长期有效,可吊销 |

API Key 优先级高于 JWT。两种方式 biocore 都支持。

### JWT 获取
```bash
curl -X POST http://biocore-host:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# 返回: {"code":0, "msg":"ok", "data":{"token":"eyJ...", "user":{...}}, "trace_id":"..."}
```

JWT 24h 后过期,需要重新登录获取。**推荐 MES 用 API Key**,避免 token 刷新逻辑。

---

## 3. 统一响应格式

**所有 v1 端点**返回如下结构:

```json
{
  "code": 0,
  "msg": "ok",
  "data": { ... },
  "trace_id": "aa3029adbfdf68c5"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | integer | `0` = 成功,`4xx`/`5xx` = 错误(同时 HTTP 状态码相同) |
| `msg` | string | 成功固定 `"ok"`,错误时是错误描述 |
| `data` | any | 业务数据(各端点不同),错误时为 `null` |
| `trace_id` | string | 跨系统排错关联 ID,16 字符 hex |

### 错误响应示例
```json
{
  "code": 404,
  "msg": "反应器 nonexistent 不存在",
  "data": null,
  "trace_id": "5c1c30e162227fc4"
}
```

### 客户端最佳实践
```js
async function callBiocore(path, options) {
  const res = await fetch(`http://biocore-host:3001/api/v1${path}`, {
    ...options,
    headers: { 'X-API-Key': process.env.BIOCORE_API_KEY, ...options?.headers },
  });
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`biocore ${body.code}: ${body.msg} (trace_id=${body.trace_id})`);
  }
  return body.data;
}
```

---

## 4. trace_id 跨系统追踪

### 4.1 自动生成
biocore 给每个请求自动生成 16 字符 hex `trace_id`,在响应头 `X-Trace-Id` 和 body `trace_id` 字段中返回。

### 4.2 客户端指定 (推荐)
MES 在调用 biocore 时,把 MES 内部的 request_id 通过 `X-Trace-Id` header 透传给 biocore:

```bash
curl -H "X-API-Key: ak_xxx.yyyy" \
     -H "X-Trace-Id: mes-req-12345" \
     http://biocore-host:3001/api/v1/reactors/Reactor-1/status
```

biocore 会原样使用该 trace_id,这样 MES 日志和 biocore 日志可通过 `mes-req-12345` 关联同一笔操作。

---

## 5. v0 兼容期 (旧 /api/* 路径)

biocore 在 Sprint 1 之前的旧 `/api/*` 路径继续保留 **6 个月** (到 `2026-10-05`),但:

- 响应头会有 `Deprecation: version="v0", sunset="2026-10-05"`
- 响应头会有 `Link: </api/v1/path>; rel="successor-version"` 指向 v1 路径
- 旧路径**不会**返回统一格式,响应是原始对象 (例如 `{version, uptime}` 直接返回)

### 迁移建议
- **新集成直接用 `/api/v1/*`**
- 已有调用 `/api/*` 的代码,在 6 个月内迁移到 `/api/v1/*`,客户端处理 unwrap `data` 字段
- 6 个月后,biocore 会移除 v0 双挂载,旧路径返回 404

---

## 6. 关键端点速查

> 完整文档见 `/api/v1/docs/`,以下仅列高频端点

### 反应器 (Reactors)

| 端点 | 用途 |
|---|---|
| `GET /api/v1/reactors` | 列出所有运行时反应器 |
| `GET /api/v1/reactors/:id/status` | 单反应器状态(含 phase/step 进度) |
| `POST /api/v1/reactors/:id/download-recipe` | 下载配方 (body: `{recipe_id, version}`) |
| `POST /api/v1/reactors/:id/start` | 启动批次 |
| `POST /api/v1/reactors/:id/pause` | 暂停 |
| `POST /api/v1/reactors/:id/stop` | 停止 |

### 配方 (Recipes)

| 端点 | 用途 |
|---|---|
| `GET /api/v1/recipes?status=approved` | 列出已锁定配方 |
| `POST /api/v1/recipes` | 创建配方 (审批后才能下载) |

### 批次 (Batches)

| 端点 | 用途 |
|---|---|
| `GET /api/v1/batches` | 列出批次 |
| `GET /api/v1/batches/:id` | 单批次详情 |
| `GET /api/v1/batches/:id/samples` | 离线检测样本 |
| `GET /api/v1/batches/:id/report` | 批次完整报告 |

### 时序数据 (Trends)

```bash
GET /api/v1/trends?reactor_id=Reactor-1&fields=temperature,pH,DO&start=-1h&stop=now()
```
- `start`/`stop` 用 Flux 相对时间 (例 `-24h`、`-1d`、`now()`)
- `fields` 白名单: `temperature`, `jacket_temp`, `pH`, `DO`, `pressure`, `airflow`, `weight`, `rpm`, `vfd_current`

### 报警 (Alarms)

| 端点 | 用途 |
|---|---|
| `GET /api/v1/alarms` | 列出报警 |
| `POST /api/v1/alarms/:id/acknowledge` | 确认报警 |

### API Key 管理

| 端点 | 用途 |
|---|---|
| `GET /api/v1/api-keys` | 列出 |
| `POST /api/v1/api-keys` | 创建 (返回 raw key 一次) |
| `DELETE /api/v1/api-keys/:id` | 撤销 |

---

## 7. WebSocket 实时数据

详见 [WS_PROTOCOL.md](./WS_PROTOCOL.md)

简要:
```js
const ws = new WebSocket('ws://biocore-host:3001/ws?api_key=ak_xxx.yyyy');
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // msg = { channel, timestamp, batch_id, reactor_id, payload }
  if (msg.channel === 'state_update') {
    console.log('Reactor state:', msg.reactor_id, msg.payload.state);
  }
};
```

支持的 channel: `pv_realtime`, `state_update`, `step_progress`, `recipe_downloaded`, `alarm`, `heartbeat`, `calculated`, `cusum`, `ai_suggestion`, `soft_sensor`

---

## 8. 错误码

| HTTP | code | 含义 |
|---|---|---|
| 400 | 400 | 请求参数错误 (缺失字段/格式不符) |
| 401 | 401 | 未授权 (token 过期/无效/缺失,或 API Key 已撤销) |
| 403 | 403 | 权限不足 (角色不够) |
| 404 | 404 | 资源不存在 |
| 500 | 500 | 服务端内部错误 |
| 503 | 503 | 依赖服务不可用 (例如 InfluxDB 未配置) |

所有错误响应都带 `trace_id`,排错时把它告诉 biocore 运维即可定位日志。

---

## 9. 限制 (Sprint 1 范围)

- **无分页约定** — 大部分 list 端点无 limit/offset 参数,后续 Sprint 补
- **无字段级权限** — API Key 当前 scopes 字段未生效,所有 key 等同于 admin 角色
- **无速率限制** — 暂无 rate limit,后续 Sprint 加
- **无 webhook 主动推送** — 当前只有 WS 广播,Sprint 3 计划加 webhook
- **PLC 实机连接** — 当前 server 默认 `MOCK_PLC=true`,生产前必须改为 `false` 并配置真实 PLC

---

## 10. 联系与支持

- API 文档: `http://biocore-host:3001/api/v1/docs/`
- WS 协议: [docs/WS_PROTOCOL.md](./WS_PROTOCOL.md)
- 部署说明: [docs/部署说明.md](./部署说明.md)
- 进度跟踪: [docs/开发进度_Sprint1_API公开化.md](./开发进度_Sprint1_API公开化.md)
