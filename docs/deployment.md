# BIOCore 生产部署指南

> SP-FX-37 — 2026-05-18

---

## 1. 快速启动

### 前提条件

- Docker 20.10+ 和 Docker Compose v2
- SSL 证书 (详见第 2 节)
- `.env` 文件 (从 `.env.example` 复制并填写生产值)

### 步骤

```bash
# 1. 克隆/更新代码
git clone <repo-url> biocore && cd biocore

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env: 设置 JWT_SECRET, INFLUX_TOKEN, MOCK_PLC=false 等

# 3. 放置 SSL 证书
mkdir -p nginx/ssl
cp /path/to/fullchain.pem nginx/ssl/cert.pem
cp /path/to/privkey.pem  nginx/ssl/key.pem

# 4. 启动生产栈
docker compose -f docker-compose.prod.yml up -d

# 5. 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 6. 确认健康状态
curl https://your-domain.com/api/v1/health/live
curl https://your-domain.com/api/v1/health/ready
```

### 停止与重启

```bash
# 停止 (保留 volume 数据)
docker compose -f docker-compose.prod.yml down

# 重启单个服务
docker compose -f docker-compose.prod.yml restart biocore-server-prod

# 查看服务状态
docker compose -f docker-compose.prod.yml ps
```

---

## 2. SSL 证书申请 (Let's Encrypt / certbot)

### 方案 A: certbot standalone (推荐首次申请)

```bash
# 安装 certbot
sudo apt install certbot   # Ubuntu/Debian
# 或: brew install certbot   # macOS

# 申请证书 (需要 80 端口空闲, 临时停止 nginx)
docker compose -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone -d your-domain.com

# 复制证书
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  nginx/ssl/key.pem
sudo chown $(whoami) nginx/ssl/*.pem

# 重启 nginx
docker compose -f docker-compose.prod.yml start nginx
```

### 方案 B: 自签证书 (内网/测试)

```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out    nginx/ssl/cert.pem \
  -subj "/C=CN/ST=Shanghai/L=Shanghai/O=BIOCore/CN=localhost"
```

### 证书自动续期

```bash
# 添加 cron (每月 1 日凌晨 2 点续期)
(crontab -l 2>/dev/null; echo "0 2 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/biocore/nginx/ssl/cert.pem && cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/biocore/nginx/ssl/key.pem && docker compose -f /path/to/biocore/docker-compose.prod.yml restart biocore-nginx-prod") | crontab -
```

---

## 3. 环境变量完整清单

> 在 `.env` 中设置。生产必填项标注 **(必须)**。

### 服务器基础

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务器监听端口 |
| `NODE_ENV` | `development` | `production` 开启 JSON 日志 |
| `LOG_LEVEL` | `info` | `error/warn/info/debug` |
| `CORS_ORIGIN` | `` | CORS 允许来源 (生产填 https://your-domain.com) |

### 安全 (必须)

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` **(必须)** | JWT 签名密钥，`openssl rand -hex 32` 生成 |
| `MOCK_PLC` **(必须=false)** | 生产必须为 `false` |

### 数据库

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_PATH` | `./data/biocore.db` | SQLite 文件路径 |
| `DATA_DIR` | `./data` | 数据目录 |

### InfluxDB

| 变量 | 说明 |
|------|------|
| `INFLUX_URL` | InfluxDB 地址 |
| `INFLUX_TOKEN` **(必须)** | InfluxDB 认证 Token |
| `INFLUX_ORG` | 组织名 |
| `INFLUX_BUCKET` | Bucket 名 |

### PLC (MOCK_PLC=false 时)

| 变量 | 说明 |
|------|------|
| `PLC_IP` | S7-200 SMART IP |
| `PLC_RACK` | 机架号 (固定 0) |
| `PLC_SLOT` | 插槽号 (固定 1) |

### Metrics (SP-FX-28)

| 变量 | 说明 |
|------|------|
| `METRICS_AUTH_TOKEN` | Prometheus metrics 端点认证 token |

### Runtime-guard

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_OPTIONS` | `--max-old-space-size=2048` | Node.js heap 上限 |
| `BIOCORE_OOM_THRESHOLD_MB` | `auto` | OOM 触发阈值 |
| `BIOCORE_OOM_GRACE_SAMPLES` | `3` | 连续采样触发数 |
| `BIOCORE_DIAGNOSTIC_DUMP_DIR` | `./crashes` | 崩溃诊断目录 |
| `BIOCORE_ROOT` | `.` | 项目根路径 |

### SMTP (预留)

| 变量 | 说明 |
|------|------|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口 (通常 587) |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASS` | SMTP 密码 |

---

## 4. 健康检查确认

部署完成后验证以下端点:

```bash
# Liveness (容器存活)
curl -f https://your-domain.com/api/v1/health/live
# 期望: {"status":"ok","ts":"..."}

# Readiness (DB 可用)
curl -f https://your-domain.com/api/v1/health/ready
# 期望: {"status":"ready","ts":"..."}
# 503 表示 DB 不可用

# nginx 自身
curl -f https://your-domain.com/__nginx_health
# 期望: ok

# API 状态
curl -f https://your-domain.com/api/v1/status
```

---

## 5. 排错 FAQ

### Q1: 容器启动后立即退出 (Exit 1)

```bash
# 查看日志
docker compose -f docker-compose.prod.yml logs biocore-server-prod
```

常见原因:
- `JWT_SECRET` 未设置或使用默认开发值
- `INFLUX_TOKEN` 为空
- SQLite volume 权限问题 (`chmod 755 ./data`)

### Q2: nginx 返回 502 Bad Gateway

- biocore-server 未健康 (`/health/live` 失败)
- 检查 `docker compose ps` 中 server 状态
- 检查 server 日志: `docker compose logs biocore-server-prod`

### Q3: SSL 握手失败

- 确认 `nginx/ssl/cert.pem` 和 `nginx/ssl/key.pem` 存在
- 检查证书是否过期: `openssl x509 -in nginx/ssl/cert.pem -noout -dates`
- 自签证书在浏览器会显示不安全提示 (正常)

### Q4: MQTT 连接超时

- 检查 mosquitto 容器状态: `docker compose ps biocore-mosquitto-prod`
- mosquitto config 路径: `./mosquitto/config/mosquitto.conf`
- 查看 mosquitto 日志: `docker compose logs biocore-mosquitto-prod`

### Q5: 数据库丢失 / volume 数据恢复

生产数据在 Docker volume `biocore_prod_data`:

```bash
# 备份 volume 数据
docker run --rm -v biocore_prod_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/biocore-data-$(date +%Y%m%d).tar.gz -C /data .

# 恢复数据
docker run --rm -v biocore_prod_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/biocore-data-YYYYMMDD.tar.gz -C /data
```

### Q6: 内存 OOM 重启

- 调整 `NODE_OPTIONS=--max-old-space-size=4096` (4GB heap)
- 查看崩溃诊断: volume `biocore_prod_crashes`

---

## 6. 升级部署

```bash
# 1. 拉取新代码
git pull

# 2. 重新构建镜像 (保留 volume 数据)
docker compose -f docker-compose.prod.yml build biocore-server

# 3. 滚动重启
docker compose -f docker-compose.prod.yml up -d --no-deps biocore-server

# 4. 验证健康
curl -f https://your-domain.com/api/v1/health/ready
```
