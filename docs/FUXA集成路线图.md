# FUXA 集成路线图

> 状态：W1 完成 · W2 后端完成 (FUXA 端配置待手动) · W3-M4 设计中
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

### M2: 用户/权限同步 (2 周)
- BIOCore admin/operator/viewer 角色 → FUXA users 表自动 sync
- FUXA 内部登录禁用，所有 auth 走 nginx + BIOCore JWT
- 权限映射:
  - BIOCore admin → FUXA admin (画图 + 改 device)
  - BIOCore operator → FUXA editor (画图)
  - BIOCore viewer → FUXA viewer (运行时查看)

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

### M4: 统一 docker-compose (1 周)
- 合并 `docker-compose.yml` + `docker-compose.fuxa.yml`
- 加 nginx service
- 加 `--profile production` 控制完整栈

### M4: 生命周期联动 (1 周)
- `depends_on` 配 healthcheck condition
- BIOCore down → FUXA 自动降级显示 last-known state
- BIOCore up → FUXA 自动重连

### M4: 监控/日志统一 (1 周)
- FUXA 日志接 `docker-compose.observability.yml` 内 Prometheus + Loki
- Grafana dashboard 含 FUXA 容器指标

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
