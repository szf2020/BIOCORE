# SP-FX-37 生产部署基础设施 — 设计规格

**Sprint**: SP-FX-37  
**日期**: 2026-05-18  
**范围**: docker-compose.prod.yml / nginx SSL / .env.example 补全 / healthcheck / logger

---

## 1. 背景与目标

BIOCore 现仅 dev 模式运行 (`docker-compose.yml` 含 `production` profile，但 nginx 指向 `host.docker.internal` 开发进程)。
SP-FX-37 交付完整生产就绪基础设施，不破坏现有 compose 文件。

---

## 2. 架构概览

```
浏览器
  │  HTTPS :443 / HTTP :80 → 301
  ▼
nginx (alpine)
  ├── /api/v1/*          → biocore-server :3001
  ├── /api/v1/scada/sse/* → biocore-server :3001 (proxy_buffering off)
  ├── /ws/*              → biocore-server :3001 (WS upgrade)
  └── /                  → web-ui :3000 (Next.js)
         │
    biocore-prod-net (bridge)
         │
  ┌──────┴────────────────────┐
  │ biocore-server :3001      │
  │ data-service / SQLite     │
  │ mosquitto :1883           │
  └───────────────────────────┘
```

**注**: SP-FX-37 `docker-compose.prod.yml` 独立文件，不覆盖 `docker-compose.yml`。

---

## 3. Part 1 — docker-compose.prod.yml

### 3.1 Services

| Service | Image | Port (内部) | Role |
|---------|-------|-------------|------|
| mosquitto | eclipse-mosquitto:2 | 1883 | MQTT Broker |
| biocore-server | biocore-server:prod | 3001 | REST/WS API |
| biocore-web-ui | biocore-web-ui:prod | 3000 | Next.js UI |
| nginx | nginx:alpine | 80, 443 | 反代 + TLS |

### 3.2 通用策略

- `restart: unless-stopped` — 所有 service
- `logging: driver: json-file, max-size: 50m, max-file: 10` (server); `10m/3` (其余)
- `resources.limits: memory: 512m, cpus: 0.5` (mosquitto); `2g/1.0` (server); `512m/0.5` (web-ui); `128m/0.25` (nginx)
- `networks: [biocore-prod-net]` — 全部服务内部互通
- `volumes: biocore_prod_data, biocore_prod_logs, mosquitto_prod_data, mosquitto_prod_log, nginx_prod_logs`

### 3.3 depends_on healthcheck 链

```
mosquitto (healthy)
    ↓
biocore-server (healthy) ← depends_on: mosquitto
    ↓
nginx ← depends_on: biocore-server
```

---

## 4. Part 2 — nginx SSL 配置

文件路径: `nginx/nginx.prod.conf`
(不覆盖现 `nginx/nginx.conf` — 保持开发配置不变)

### 4.1 路由规则

| Location | Upstream | 特殊设置 |
|----------|----------|----------|
| `/api/v1/scada/sse/` | biocore-server:3001 | `proxy_buffering off`, `X-Accel-Buffering no` |
| `/ws/` | biocore-server:3001 | WS Upgrade headers |
| `/api/` | biocore-server:3001 | `proxy_read_timeout 600s` |
| `/` | biocore-server:3001 | 标准反代 (server 含 Next.js) |
| `/__nginx_health` | - | 内部健康检查 200 |

### 4.2 TLS 配置

- `ssl_certificate /etc/nginx/ssl/cert.pem` (volume mount)
- `ssl_certificate_key /etc/nginx/ssl/key.pem`
- `ssl_protocols TLSv1.2 TLSv1.3`
- `ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5`
- `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always`
- HTTP :80 → 301 HTTPS

### 4.3 其他

- `gzip on` + 常见类型
- `client_max_body_size 100M`

---

## 5. Part 3 — .env.example 补全

新增变量 (追加到文件末尾，不覆盖现有):

| 变量 | 说明 |
|------|------|
| `DATABASE_PATH` | SQLite 文件路径 (生产: /app/data/biocore.db) |
| `JWT_SECRET` | JWT 签名密钥 (生产: 随机 256-bit hex) |
| `BIOCORE_ROOT` | 项目根路径 |
| `SMTP_HOST/PORT/USER/PASS` | 邮件告警 (占位) |
| `METRICS_AUTH_TOKEN` | SP-FX-28 metrics 端点 token |
| `LOG_LEVEL` | error/warn/info/debug |
| `CORS_ORIGIN` | CORS 允许来源 |

---

## 6. Part 4 — healthcheck endpoints

### 6.1 新增端点

| Path | Method | Auth | 响应 | 用途 |
|------|--------|------|------|------|
| `/api/v1/health/live` | GET | PUBLIC | 200 `{"status":"ok"}` | docker liveness |
| `/api/v1/health/ready` | GET | PUBLIC | 200/503 | docker readiness (DB ping) |

**readiness 检查逻辑**:
1. SQLite: `SELECT 1` — 失败 → 503
2. MQTT: 可选检查, 失败仅 warn

### 6.2 PUBLIC_PATHS 更新

在 `middlewares/auth.ts` 的 `PUBLIC_PATHS` 加入:
- `/health/live`
- `/health/ready`

### 6.3 文件

- `packages/server/src/health-routes.ts` (新)
- `packages/server/src/__tests__/health-routes.test.ts` (新) — 3 tests

---

## 7. Part 5 — 生产 logger

### 7.1 设计

文件: `packages/server/src/services/logger.ts`

零外部依赖，纯 Node.js。

输出策略:
- `NODE_ENV=production` → JSON to stdout
- `NODE_ENV=test` → silent
- 其它 → 带前缀的 console

JSON 格式:
```json
{"ts":"2026-05-18T09:00:00.000Z","level":"info","msg":"启动","pid":1}
```

Level 过滤由 `LOG_LEVEL` 环境变量控制 (默认: info)。

### 7.2 测试

- T1: level filter (debug 低于 warn 时不输出)
- T2: JSON format (生产环境输出可解析 JSON)
- T3: silent in test env (NODE_ENV=test 不输出)

---

## 8. Part 6 — docs/deployment.md

内容大纲:
1. 快速启动 (docker compose prod)
2. SSL 证书申请 (certbot Let's Encrypt 指引)
3. 环境变量完整清单
4. 健康检查确认步骤
5. 排错 FAQ

---

## 9. 约束确认

- [x] ZERO 新第三方 dep (logger 自写)
- [x] 不破坏 animation-engine T8 invariant
- [x] baseline server 221 不减; 预期 +6-8
- [x] 不碰 docker-compose.fuxa.yml / widget / RuntimeCanvas / dict / migrations / web-ui pages
- [x] macOS BSD sed → 用 Edit tool
- [x] pnpm via `$HOME/.hermes/node/bin`

---

## 10. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| PUBLIC_PATHS 增改影响 auth | HIGH | 仅 append, 不修改现有 path |
| docker-compose.prod.yml 与现有 compose 冲突 | LOW | 新文件, 独立 network/volume 名 |
| index.ts append 并发冲突 (4 agents) | MEDIUM | git pull --rebase + 末尾 append |
