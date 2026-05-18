# SP-FX-46 Security Pen Test Audit — Design Spec

**Sprint**: SP-FX-46
**Date**: 2026-05-18
**Author**: Security Audit Agent (read-only)
**Status**: Complete

---

## 1. 范围

本 spec 定义 BIOCore 的 OWASP Top 10 (2021) 安全审计范围。审计完全 read-only，不改任何 packages/* 代码。

### 1.1 被审对象

| 组件 | 路径 |
|------|------|
| Express API Server | `packages/server/src/` |
| Auth/ACL 中间件 | `packages/server/src/middlewares/` |
| Frontend (Next.js) | `packages/web-ui/src/` |
| Nginx 配置 | `nginx/nginx.prod.conf` |
| 环境变量模板 | `.env.example` |
| 依赖 | `pnpm-lock.yaml` (via `pnpm audit`) |

### 1.2 不在范围

- PLC 固件
- InfluxDB 内部配置
- Mosquitto MQTT 内部配置
- CI/CD pipeline 配置

---

## 2. OWASP Top 10 审计维度

### A01 Broken Access Control
- Route RBAC 覆盖率 (requireRole)
- view-acl default-allow 边缘 case
- AI suggestion accept/reject 无 role 守卫

### A02 Cryptographic Failures
- JWT 算法 (自定义 SHA-256 vs 标准 HMAC)
- JWT secret 默认值守卫
- bcrypt cost factor
- SQLite at-rest encryption 缺失
- HTTPS 强制

### A03 Injection
- SQL: better-sqlite3 prepared statement 覆盖
- condition-evaluator sandbox (自建 tokenizer, 无 eval)
- expression-eval (expr-eval v2.0.2, 含已知 CVE)
- SVG XSS sanitization (ThumbnailRenderer)
- backup spawn 命令注入风险

### A04 Insecure Design
- AI suggestion accept 无 requireRole
- writeTag opts.confirmed=true 链验证
- WriteIntentDialog 用户感知确认流

### A05 Security Misconfiguration
- .env.example 弱默认 JWT_SECRET
- Express X-Powered-By header (未禁用)
- Helmet 安全头缺失 (CSP, Referrer-Policy, HSTS only in nginx)
- CORS 配置

### A06 Vulnerable Components
- expr-eval: GHSA-8gw3-rxh4-v6jx (Prototype Pollution), GHSA-jc85-fpwf-qm7x
- next.js: 3 个 HIGH DoS CVE (GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj)
- basic-ftp: 2 个 HIGH (via puppeteer 传递依赖)
- 合计: 9 HIGH, 14 MODERATE, 2 LOW

### A07 Authentication Failures
- JWT 过期: 24 小时 (无 refresh token 机制)
- 失败登录无 audit_log 记录 (只有成功的密码迁移有 audit)
- MFA 未实现
- brute force: loginRateLimit 5/min 已覆盖

### A08 Software and Data Integrity
- backup integrity_check (PRAGMA) 已有
- migration rollback 机制不存在 (只有 forward 迁移)
- SSE/WS 消息无签名完整性保护

### A09 Security Logging and Monitoring
- audit_log 覆盖: POST/PUT/PATCH/DELETE 均记录
- 失败登录未记录到 audit_log
- Prometheus metrics 已有 (admin 保护)

### A10 SSRF
- Ollama URL 硬编码 localhost:11434 (不受用户控制)
- FUXA iframe src 来自 FUXA_URL env (不受请求参数控制)
- backup S3 stub 未实现 (无 SSRF 面)

---

## 3. 审计方法

1. 静态代码分析 (grep, Read)
2. pnpm audit CVE 扫描
3. 中间件链 trace (authMiddleware → requireRole → handler)
4. 关键 invariant 手动验证 (writeTag.confirmed, AI→dispatcher chain)
