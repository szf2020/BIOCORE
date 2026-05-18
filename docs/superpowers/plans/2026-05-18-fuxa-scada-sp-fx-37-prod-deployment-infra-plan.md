# SP-FX-37 生产部署基础设施 — 执行计划

**Sprint**: SP-FX-37  
**日期**: 2026-05-18

---

## 任务清单

### T1: TDD RED — health-routes 测试 (先写测试)
- 新建 `packages/server/src/__tests__/health-routes.test.ts`
- 3 tests: live 200 / ready 200 (DB ok) / ready 503 (DB fail)
- 运行确认 RED (文件不存在时失败)
- verify: vitest RED

### T2: TDD RED — logger 测试 (先写测试)
- 新建 `packages/server/src/__tests__/logger.test.ts`
- 3 tests: level filter / JSON format / silent in test
- 运行确认 RED
- verify: vitest RED

### T3: 实现 logger.ts
- 新建 `packages/server/src/services/logger.ts`
- 零外部依赖: 纯 Node.js process.stdout.write
- Level 过滤: LOG_LEVEL env (默认 info)
- 生产 JSON 输出 / test silent / dev 彩色 console
- verify: vitest GREEN for logger tests

### T4: 实现 health-routes.ts + 注册
- 新建 `packages/server/src/health-routes.ts`
- GET /health/live → 200 always
- GET /health/ready → DB ping + MQTT optional
- 更新 `packages/server/src/middlewares/auth.ts` PUBLIC_PATHS
- append 到 `packages/server/src/index.ts` 末尾注册
- verify: vitest GREEN for health tests

### T5: docker-compose.prod.yml
- 新建 `docker-compose.prod.yml`
- 4 services: mosquitto + biocore-server + nginx (prod)
- restart: unless-stopped, healthcheck, resources, logging
- volumes + networks (独立 biocore-prod-net)
- verify: docker compose config 解析正确

### T6: nginx/nginx.prod.conf
- 新建 `nginx/nginx.prod.conf`
- HTTP :80 → 301 HTTPS
- HTTPS :443 with TLS 1.2/1.3 + HSTS
- 路由: SSE / WS / REST / web-ui
- gzip on, client_max_body_size 100M
- verify: 语法正确

### T7: .env.example 补全 + docs/deployment.md
- Edit 现有 `.env.example` 追加 prod 变量
- 新建 `docs/deployment.md`
- verify: 文件内容完整

---

## 执行顺序

T1 → T2 (RED first) → T3 → T4 → T5 → T6 → T7 → 全量 vitest → push

---

## 完工验收

- [ ] server vitest: 221 + 6 = 227 passed
- [ ] docker-compose.prod.yml 存在, 4 services
- [ ] health endpoints: /api/v1/health/live + /api/v1/health/ready
- [ ] nginx.prod.conf: SSL + 路由正确
- [ ] .env.example 含新 prod vars
- [ ] docs/deployment.md 存在
