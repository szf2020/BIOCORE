# FUXA 集成路线图

> 状态：W1 完成 · W2 后端完成 (FUXA 端配置待手动) · W3 完成 · **M2 用户同步后端完成** · M4 统一 compose + 监控 ✅ (Loki 日志待加)
> 日期：2026-05-14

## 总体路线

```
W1 (1 周) ─→ W2 (1 周) ─→ W3 (1 周) ─→ M2-M4 (2-3 月)
 共存      数据融合      认证融合      业务融合
 iframe     MQTT 桥      nginx+JWT     view持久化+webhook+审计
```

融合度演进：15% → 45% → 65% → 85%

---

## W1 共存 (已完成)

### 改动
- `docker-compose.fuxa.yml` — 官方镜像 `frangoteam/fuxa:latest`，1881 端口
- `/dashboard/hmi/page.tsx` — iframe + 返回按钮 + 阶段提示横幅
- `/dashboard/page.tsx` — 顶部 Workflow 图标按钮入口

### 启动
```bash
docker run -d --name biocore-fuxa --restart unless-stopped \
  -p 1881:1881 \
  -v $(pwd)/fuxa/appdata:/usr/src/app/FUXA/server/_appdata \
  -v $(pwd)/fuxa/db:/usr/src/app/FUXA/server/_db \
  -v $(pwd)/fuxa/logs:/usr/src/app/FUXA/server/_logs \
  -v $(pwd)/fuxa/images:/usr/src/app/FUXA/server/_images \
  frangoteam/fuxa:latest
```

---

## W2 数据融合 (后端完成)

### 改动
- `mosquitto/config/mosquitto.conf` — Mosquitto 配置 (1883 TCP, allow_anonymous)
- `docker-compose.fuxa.yml` — 加 mosquitto service
- `packages/server/src/mqtt-publisher.ts` — MQTT 客户端 + boot beacon
- `packages/server/src/ws-server.ts` — broadcast() 自动 mirror MQTT
- `packages/server/src/index.ts` — 初始化 mqttPublisher
- `packages/server/package.json` — 加 `mqtt@^5.10.0` 依赖

### Topic Schema

| Topic | 触发 | QoS | Retain |
|---|---|---|---|
| `biocore/system/boot` | server 启动连 MQTT | 1 | true |
| `biocore/reactor/{id}/pv_realtime` | reactor PLC 读循环 | 0 | false |
| `biocore/reactor/{id}/state_update` | ISA-88 状态转换 | 0 | false |
| `biocore/reactor/{id}/alarm` | 联锁/CUSUM/限位触发 | 0 | false |
| `biocore/reactor/{id}/step_progress` | Phase/Step 推进 | 0 | false |
| `biocore/reactor/{id}/cusum` | 实时异常检测 | 0 | false |
| `biocore/reactor/{id}/soft_sensor` | 软测量推断 | 0 | false |
| `biocore/reactor/{id}/loop_entered/iterated/exited` | DAG Loop 节点 | 0 | false |
| `biocore/reactor/{id}/branch_evaluated` | DAG IF/ELSE | 0 | false |
| `biocore/system/heartbeat` | PC↔PLC 心跳 | 0 | false |
| `biocore/ai/suggestion` | AI 建议生成 | 0 | false |

### Payload 格式 (JSON)
```json
{
  "channel": "pv_realtime",
  "timestamp": "2026-05-14T13:00:00.000Z",
  "batch_id": "B042",
  "reactor_id": "R1",
  "payload": { "temperature": 30.1, "pH": 7.0, "DO": 85 }
}
```

### 启动 (W2 完整栈)
```bash
# Mosquitto
docker run -d --name biocore-mosquitto --restart unless-stopped \
  -p 1883:1883 \
  -v $(pwd)/mosquitto/config:/mosquitto/config:ro \
  -v $(pwd)/mosquitto/data:/mosquitto/data \
  -v $(pwd)/mosquitto/log:/mosquitto/log \
  eclipse-mosquitto:2

# BIOCore server 自动连接 (env: MQTT_BROKER_URL=mqtt://localhost:1883)
pnpm dev:server

# 验证
docker exec biocore-mosquitto mosquitto_sub -h localhost -t 'biocore/#' -v
```

### FUXA 端配置 (手动 GUI，W2 收尾)

1. 浏览器打开 `http://localhost:1881` (或 BIOCore `/dashboard/hmi`)
2. Editor → Devices → Add Device → Type: `MQTTclient`
3. 配置:
   - Server URL: `mqtt://host.docker.internal:1883` (FUXA 容器内访问 host)
   - 或 Docker 网络模式: `mqtt://biocore-mosquitto:1883` (同 network)
4. Add Tag → Topic: `biocore/reactor/R1/pv_realtime` → JSON path: `payload.temperature`
5. 拖一个 Gauge 控件 → 绑定 tag → 运行时显示实时温度

---

## W3 认证融合 (设计中)

### 目标
- 单点登录: BIOCore JWT cookie → FUXA / mosquitto 全部 SSO
- 关闭 FUXA 1881 host 直连，仅通过 nginx 反代
- mosquitto MQTT auth 校验 BIOCore JWT

### 拓扑

```
浏览器 → nginx:80 → ┬→ / → BIOCore web-ui :3000
                    ├→ /api/ → BIOCore server :3001
                    ├→ /ws → BIOCore WSS
                    └→ /fuxa/ → biocore-fuxa:1881 (内网)
                       (auth_request → /api/auth/verify)
```

### nginx 配置示例

```nginx
upstream biocore-web { server host.docker.internal:3000; }
upstream biocore-api { server host.docker.internal:3001; }
upstream fuxa        { server biocore-fuxa:1881; }

server {
  listen 80;

  location / {
    proxy_pass http://biocore-web;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /api/ {
    proxy_pass http://biocore-api;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /ws {
    proxy_pass http://biocore-api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /fuxa/ {
    auth_request /__verify;
    proxy_pass http://fuxa/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location = /__verify {
    internal;
    proxy_pass http://biocore-api/api/auth/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
  }
}
```

### BIOCore server 需新增
- `GET /api/auth/verify` — 校验 cookie 中 JWT，valid 返 204，invalid 返 401

### mosquitto JWT auth
- 安装 mosquitto-go-auth 插件 (或 mosquitto-auth-plug)
- 配置 JWT mode，验证 BIOCore 签发的 token
- 或简化：用 password_file，BIOCore 启动时同步用户

### 工作量
~1 周 (5 工日)

---

## Level 3 业务融合 (M2-M4)

### M2: View 持久化迁移 (2 周)
- migration 025: `fuxa_views` 表
- REST `POST/GET /api/v1/fuxa-views/:id` CRUD
- FUXA 源码 fork + 改 view 加载 hook，从 BIOCore API 拉而非本地文件
- 单备份脚本覆盖 (已扩展 backup-db.sh)

### M2: 用户/权限同步 ✅ (后端已实施)

**实施文件**:
- `packages/server/src/fuxa-user-sync.ts` (新, 245 行) — sync 工厂
- `packages/server/src/index.ts` (改) — import + 启动后 syncAllUsers() + shutdown 清 timer

**FUXA 用户系统评估** (只读探查 `/Volumes/SSD/FUXA`):
- 存储: SQLite `<workDir>/users.fuxap.db`, 表 `users (username, fullname, password, groups, info)` 和 `roles (name, value)`
- REST API: `POST/GET/DELETE /api/users`, `POST/GET/DELETE /api/roles` (header `x-access-token`, 仅 admin)
- 登录: `POST /api/signin {username, password}` → `{data:{token}}` (JWT, 默认 1h)
- 权限模型: `groups` 字段是 bitmask
  - 文件: `/Volumes/SSD/FUXA/client/src/app/_models/user.ts`
  - 值: `-1` / `255` = admin; `128` = Administrator; `4` = Engineer; `2` = Operator; `1` = Viewer

**角色映射表**:

| BIOCore role | FUXA groups | FUXA 等价权限 |
|---|---|---|
| admin    | 255 | Admin (画图 + 改 device + 改用户) |
| engineer | 255 | Admin |
| operator |   4 | Engineer (画图但不改用户/角色) |
| viewer   |   1 | Viewer (仅运行时查看) |

**同步策略**:
- 启动后 `fuxaUserSync.syncAllUsers()` 全量推送一次 (失败仅 warn, 不阻塞 listen)
- 每 1 小时 `setInterval` reconcile (默认; `FUXA_SYNC_ENABLED=false` 关闭)
- 单向: 仅 BIOCore → FUXA; FUXA 内部禁注册/改密 (走 nginx + BIOCore JWT)
- 密码不同步: 首次创建用随机 24-byte base64url 占位 (auth 已禁, 不会用到); 后续 UPDATE 不传 password 保留旧 hash
- 跳过 `username === 'admin'`: 保留 FUXA 自带 admin 账户 (用于本同步登录)
- 删除暂不级联 (保守, 留 M3 处理)

**环境变量**:

| Env | 默认 | 说明 |
|---|---|---|
| `FUXA_SYNC_ENABLED` | `true` | `false` 关闭同步 |
| `FUXA_BASE_URL` | `http://localhost:1881` | FUXA 入口 (compose 内用 `http://fuxa:1881`) |
| `FUXA_ADMIN_USER` | `admin` | FUXA 内置 admin 用户名 |
| `FUXA_ADMIN_PASS` | (空) | **必填**; 未配置则跳过同步并 warn |

**启动命令** (开发模式):
```bash
# .env.local 加:
# FUXA_ADMIN_USER=admin
# FUXA_ADMIN_PASS=<FUXA 初始 admin 密码, 默认 123456 启动后立即改>
# FUXA_BASE_URL=http://localhost:1881

pnpm dev:server
# 日志应见: [FUXA-Sync] 全量: created=N updated=M errors=0 total=K
```

**手动验证**:
```bash
# 1. BIOCore 端建一个 engineer
curl -X POST http://localhost:3001/api/v1/users \
  -H 'Authorization: Bearer <admin token>' \
  -H 'Content-Type: application/json' \
  -d '{"username":"eng1","display_name":"工程师1","password":"x","role":"engineer"}'

# 2. 等到下次 reconcile 或重启 server
# 3. FUXA 端验证
TOKEN=$(curl -s -X POST http://localhost:1881/api/signin \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<FUXA admin pass>"}' | jq -r .data.token)
curl -s http://localhost:1881/api/users -H "x-access-token: $TOKEN" | jq
# 应见 eng1, groups=255
```

**已知限制 / 后续 (M3)**:
- 当前未在 `auth-routes.ts` POST/PUT/DELETE `/users` 钩 `syncOnUserChange()`; 改动靠下一次 reconcile (最长 1h 延迟)。M3 可在 routes 中直接调
- FUXA 端未实现删除级联: BIOCore 软删 (is_active=0) 后 FUXA 仍保留该 user, 凭 nginx auth_request 拒绝访问即可。如需硬删, 走 `DELETE /api/users?param=<username>`
- BIOCore admin 用户名若也叫 `admin` 会被跳过 (避免覆盖 FUXA 自带 admin)。生产建议 BIOCore admin 用其他用户名 (如 `biocore-admin`)
- `info.roles` 字段未填: FUXA 自定义角色 (roles 表) 暂未对接, 仅依赖 groups bitmask 控权

### M3: 写操作 webhook → 建议缓冲区 (2 周)
- FUXA `setValue` 拦截 (源码 patch 或 MQTT 反向)
- POST `/api/v1/suggestions/buffer` → BIOCore
- 人工 UI 确认 → batch-engine 下发 PLC
- **CLAUDE.md 第 7 节硬约束**: AI/HMI 永不直写 PLC

### M3: 审计统一 (1 周)
- FUXA 操作 webhook → `audit_logs` 表
- 字段: action_type=`hmi`, source=`fuxa`, user_id (from JWT)
- 涵盖: view 编辑、tag 写值意图、device 改配置

### M3: 备份扩展 (已完成于 W2)
- `scripts/backup-db.sh` 含 fuxa/ + mosquitto/data 备份

### M4: 统一 docker-compose ✅
- 已合并 `docker-compose.fuxa.yml` (mosquitto/fuxa/nginx) 入 `docker-compose.yml`
- 删除 `docker-compose.fuxa.yml` (legacy)
- 加 nginx service (profile=production)
- 加 user-defined network `biocore-net`, 所有容器走容器名互访
- nginx upstream 不再依赖 `host.docker.internal`, 改为 `biocore-server:3001` + `biocore-fuxa:1881`

#### 启动命令

```bash
# 仅核心 (biocore-server + influxdb)
docker compose up -d

# 核心 + FUXA HMI 栈 (含 mosquitto, 开发期浏览器直连 1881)
docker compose --profile hmi up -d

# 完整生产栈 (含 nginx 反代单入口 8080)
docker compose --profile production up -d
```

#### profile 矩阵

| service        | 默认 | --profile hmi | --profile production |
|----------------|:----:|:-------------:|:--------------------:|
| influxdb       |  ✅  |       ✅       |          ✅           |
| biocore-server |  ✅  |       ✅       |          ✅           |
| mosquitto      |      |       ✅       |          ✅           |
| fuxa           |      |       ✅       |          ✅           |
| nginx          |      |               |          ✅           |

### M4: 生命周期联动 ✅
- `depends_on` 全链 healthcheck condition:
  - `biocore-server` ← `influxdb` (healthy)
  - `fuxa` ← `mosquitto` (healthy)
  - `nginx` ← `fuxa` (healthy) + `biocore-server` (healthy)
- 启动顺序自动: influxdb → biocore-server, mosquitto → fuxa, 然后 nginx
- BIOCore down → FUXA 自动降级显示 last-known state
- BIOCore up → FUXA 自动重连

### M4: 监控/日志统一 ✅ (监控已完成 · 日志待 Loki 接入)

#### Prometheus exporters (已接入 docker-compose.observability.yml)
- `cadvisor` — 容器层 CPU/mem/net/io，覆盖 FUXA/mosquitto/nginx 三个容器 (镜像 `gcr.io/cadvisor/cadvisor:v0.49.1`，端口 `8081`)
- `mqtt-exporter` — 订阅 mosquitto `$SYS/#` 翻译 Prometheus 指标 (镜像 `kpetremann/mqtt-exporter:latest`，端口 `9234`)
- `nginx-exporter` — 抓 nginx `/stub_status` (镜像 `nginx/nginx-prometheus-exporter:1.1.0`，端口 `9113`)
- 既有 `biocore-server` 的 `/api/v1/admin/metrics` 保留

#### Prometheus scrape targets (observability/prometheus.yml)
| Job | Target | 说明 |
|---|---|---|
| `biocore-server` | `biocore-server:3001` | 应用层 prom-client 指标 (heap/event-loop/PLC/WS) |
| `cadvisor` | `cadvisor:8080` | 所有容器 (含 FUXA) CPU/mem/net |
| `mqtt-broker` | `mqtt-exporter:9000` | mosquitto $SYS topic 翻译 |
| `nginx` | `nginx-exporter:9113` | nginx stub_status |

> FUXA 官方镜像 `frangoteam/fuxa:latest` 不暴露 `/metrics` endpoint (源码无 prom-client)，容器层健康全部走 cAdvisor；FUXA 应用层指标待 W3/M2 fork 时补 (在 FUXA 内部加 `express-prom-bundle`)。

#### Grafana 看板
- 既有: **`BIOCore Runtime`** (`uid=biocore-runtime`) — server 运行时
- 新增: **`BIOCore x FUXA 集成 (M4 - 容器 / MQTT / Nginx)`** (`uid=biocore-fuxa-integration`)
  - 文件: `observability/grafana/dashboards/biocore-fuxa-integration.json`
  - Row 1 · FUXA 容器健康: CPU / 内存 / 存活探针 / 网络
  - Row 2 · Mosquitto: 连接数 / 消息收发率 / 字节吞吐 / 订阅数 + retained
  - Row 3 · Nginx: 请求速率 / 连接状态 (active/reading/writing/waiting) / 失败比
  - Row 4 · BIOCore→MQTT 桥: WS 连接数 vs broker 消息率交叉对比 (定位 broadcast 转 MQTT 是否阻塞)

Grafana URL: `http://localhost:3002` (login `admin` / `biocore_admin`)，Prometheus datasource 自动 provision。

#### Nginx 配置 (必须改动)
为让 `nginx-exporter` 可工作，`nginx/nginx.conf` 已加：
```nginx
location = /stub_status {
  stub_status on;
  access_log off;
  allow 172.16.0.0/12;  # docker bridge
  allow 10.0.0.0/8;
  allow 192.168.0.0/16;
  allow 127.0.0.1;
  deny all;
}
```

#### 日志统一 (Loki + Promtail) — 暂未接入
- 当前栈无 Loki/Promtail。FUXA/mosquitto/nginx docker logs 已被 docker daemon 收集 (json-file driver, 容器 compose 内已配 max-size + max-file 轮转)。
- 短期方案: `docker logs biocore-fuxa`、`docker logs biocore-mosquitto`、`docker logs biocore-nginx`
- 长期: 加 Promtail + Loki service 到 `docker-compose.observability.yml`, 配 docker SD 自动抓所有 `biocore-*` 容器日志，并在 Grafana 中加 Loki datasource

#### 启动命令
```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.fuxa.yml \
  -f docker-compose.observability.yml \
  --profile observability up -d
```

#### 验证
- Prometheus targets: `http://localhost:9090/targets` 应见 4 个 job 全 UP
- Grafana 看板: `http://localhost:3002/d/biocore-fuxa-integration`
- cAdvisor: `http://localhost:8081/containers/`
- 状态: 容器 CPU/mem ✅, MQTT 消息率 ✅, nginx 请求率 ✅, FUXA 应用层指标 ⏳ (依赖 W3 fork)

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| FUXA 源码 fork 维护成本 | 升级 FUXA 时手动 merge | 改动最小化，集中在 view loader + auth hook |
| MQTT broker 单点故障 | 数据流断 | mosquitto 在 docker restart=always；mqtt-publisher 内置重连 |
| FUXA 写操作绕开缓冲区直写 | 违反 CLAUDE.md 安全约束 | mosquitto ACL 禁止 FUXA publish 到 PLC write topic；BIOCore 仅接 suggest endpoint |
| 双备份冲突 (SQLite 锁) | 备份失败 | mosquitto/FUXA 备份与 SQLite 错峰；FUXA 容器 pause 期间备份 |
| 跨容器网络 | host.docker.internal 仅 macOS/Windows | 生产 Linux 用容器 bridge network；FUXA + mosquitto 同 docker network |

---

## 测试 Checklist

### W2 (后端，已完成)
- [x] mosquitto 容器健康
- [x] BIOCore server 启动后 `[MQTT] 已连接`
- [x] `biocore/system/boot` retained beacon 可订阅
- [x] `ws-server broadcast` 内部 publish 路径正常

### W2 (FUXA 端，手动)
- [ ] FUXA editor 创建 MQTT device
- [ ] 订阅 `biocore/reactor/R1/pv_realtime`
- [ ] 启 mock 批次产生 PV → FUXA Gauge 实时显示
- [ ] Server 重启后 FUXA 自动重连 mosquitto

### W3
- [ ] nginx 反代所有 BIOCore + FUXA 路径
- [ ] 浏览器直连 1881 失败 (端口仅内网)
- [ ] BIOCore login → cookie → FUXA iframe 自动可用
- [ ] cookie 过期 → /fuxa/ 自动 redirect /login
- [ ] mosquitto 拒绝无 JWT 客户端
