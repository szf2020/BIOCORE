# BIOCore Security Pen Test Audit

**Sprint**: SP-FX-46
**Audit Date**: 2026-05-18
**Method**: OWASP Top 10 (2021) 静态代码分析 + pnpm audit
**Scope**: Read-only audit — 零代码改动
**Auditor**: Security Audit Agent (autonomous)

---

## 摘要

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 6 |
| MEDIUM | 5 |
| LOW | 4 |
| **Total** | **16** |

### pnpm audit 结果

```
25 vulnerabilities found
Severity: 2 low | 14 moderate | 9 high
```

**关键 CVE**:
- `expr-eval <=2.0.2`: GHSA-8gw3-rxh4-v6jx (Prototype Pollution, HIGH) + GHSA-jc85-fpwf-qm7x (Function escape, HIGH) — 无 patch 版本
- `next >=13.0.0 <15.0.8`: GHSA-h25m-26qc-wcjf (RSC DoS, HIGH)
- `next >=13.0.0 <15.5.15`: GHSA-q4gf-8mx6-v5v3 (Server Component DoS, HIGH)
- `next >=13.0.0 <15.5.16`: GHSA-8h8q-6873-q5fj (Server Component DoS, HIGH)
- `basic-ftp <=5.3.0`: GHSA-rp42-5vxx-qpwr / GHSA-rpmf-866q-6p89 (传递依赖 via puppeteer, HIGH)

---

## Findings

---

## Finding ID: F-01
**Severity**: CRITICAL
**OWASP**: A01 Broken Access Control
**Location**: `packages/server/src/index.ts:2930` — `POST /ai/suggestions/:id/accept`
**Description**: AI 建议接受端点 (`POST /ai/suggestions/:id/accept`) 和拒绝端点 (`POST /ai/suggestions/:id/reject`) 及重试端点 (`POST /ai/suggestions/:id/retry-dispatch`) 均没有 `requireRole()` 守卫。任何已认证用户 (包括 `viewer` 角色) 均可接受 AI 建议，触发 `setDispatchPending`，导致 SCADA 写操作进入 dispatcher 队列并最终写入 PLC。
**Risk**: `viewer` 角色或低权限用户可绕过工程师/操作员审批，直接触发 PLC 写操作。这是 OT 系统最高风险场景——未授权人员可修改生产参数。
**Recommendation**: 在三个端点均添加 `requireRole('admin', 'engineer', 'operator')`，retry-dispatch 建议限制为 `requireRole('admin', 'engineer')`。
**Status**: open

---

## Finding ID: F-02
**Severity**: HIGH
**OWASP**: A06 Vulnerable Components
**Location**: `packages/web-ui/package.json` — `expr-eval` dependency
**Description**: `expr-eval <=2.0.2` 含两个已知 CVE。GHSA-8gw3-rxh4-v6jx: Prototype Pollution，攻击者可通过构造恶意表达式污染 `Object.prototype`。GHSA-jc85-fpwf-qm7x: 未限制的函数注入，可绕过 `allowMemberAccess:false`。当前配置虽设置了 `allowMemberAccess: false` 和函数白名单，但底层库本身存在已知逃逸向量。`pnpm audit` 显示 "Patched versions: <0.0.0" — 无官方 patch。
**Risk**: 攻击者通过 SCADA 视图编辑器提交恶意表达式，触发 Prototype Pollution，影响运行时对象。
**Recommendation**: 迁移至 `mathjs` 或 `jexl`；或完全自建 expression evaluator (参考 `condition-evaluator.ts` 白名单 tokenizer 模式)。短期缓解: 在表达式输入层添加 `__proto__`、`constructor`、`prototype` 黑名单过滤。
**Status**: open

---

## Finding ID: F-03
**Severity**: HIGH
**OWASP**: A06 Vulnerable Components
**Location**: `packages/web-ui/package.json` — `next` dependency
**Description**: Next.js 存在多个 HIGH 严重度 DoS CVE: GHSA-h25m-26qc-wcjf (HTTP 请求反序列化 DoS, RSC 模式, <15.0.8)，GHSA-q4gf-8mx6-v5v3 (Server Components DoS, <15.5.15)，GHSA-8h8q-6873-q5fj (Server Components DoS, <15.5.16)。
**Risk**: 攻击者发送特制 HTTP 请求导致 Next.js 崩溃，造成前端 HMI DoS，影响操作员监控可用性。
**Recommendation**: 升级 Next.js 至 `>=15.5.16`。
**Status**: open

---

## Finding ID: F-04
**Severity**: HIGH
**OWASP**: A01 Broken Access Control
**Location**: `packages/server/src/index.ts:808-899` — PLC 连接/变量管理 endpoints
**Description**: PLC 连接和变量管理的所有写操作无 `requireRole()` 守卫: `POST /plc/connections`、`PUT /plc/connections/:id`、`DELETE /plc/connections/:id`、`POST /plc/variables`、`PUT /plc/variables/:id`、`DELETE /plc/variables/:id`。任何已认证用户可修改 PLC 地址映射。
**Risk**: 低权限用户可修改 PLC 变量映射，使关键变量 (temperature/pH/DO) 指向错误 PLC 地址，导致控制信号错误或错误传感器读数被当作正确值使用。
**Recommendation**: 所有 PLC 配置写操作添加 `requireRole('admin', 'engineer')`。
**Status**: open

---

## Finding ID: F-05
**Severity**: HIGH
**OWASP**: A01 Broken Access Control
**Location**: `packages/server/src/index.ts:966-1005` — Phase Template 管理
**Description**: Phase 模板 CRUD 无 role 守卫: `POST /phase-templates`、`PUT /phase-templates/:type`、`DELETE /phase-templates/:type`、`POST /phase-templates/init-defaults`。Phase 模板的 `plc_mappings` 字段直接影响 PLC 写地址。代码注释自述 "调试阶段，所有模板均可编辑/删除" 说明锁定逻辑未完成。
**Risk**: 任何已认证用户可修改生产批次用的 phase 模板 PLC 映射，影响所有后续批次安全。
**Recommendation**: 添加 `requireRole('admin', 'engineer')`；完成生产锁定逻辑替换"调试阶段"注释。
**Status**: open (代码注释已知未完成)

---

## Finding ID: F-06
**Severity**: HIGH
**OWASP**: A02 Cryptographic Failures
**Location**: `packages/server/src/index.ts:449-458` — `verifyJWT()` (WebSocket 使用)
**Description**: 存在两个 `verifyJWT` 实现。`middlewares/auth.ts` 使用 `timingSafeEqual` (P1 修复已应用)，而 `index.ts:verifyJWT` 使用普通 `!==` 字符串比较。`index.ts` 的实现被 `ws-server.ts` 用于 WebSocket 连接鉴权，存在 timing attack 向量。
**Risk**: 攻击者通过测量 WebSocket 握手响应时间可逐字节猜测有效 JWT 签名。
**Recommendation**: 统一使用 `middlewares/auth.ts` 的 `verifyJWT`，或将 `index.ts` 中的比较改为 `timingSafeEqual`。消除重复实现。
**Status**: open

---

## Finding ID: F-07
**Severity**: HIGH
**OWASP**: A09 Security Logging and Monitoring
**Location**: `packages/server/src/auth-routes.ts:92-95` — 登录失败路径
**Description**: 登录失败 (用户名不存在/密码错误) 不记录到 audit_log。auth-routes.ts 仅在成功登录后的密码 hash 迁移时调用 `writeAuditLog`。`audit-log.ts` 中间件会记录 POST /auth/login 的 body，但 `user_id` 为 null，且缺少明确的 `action: 'login_failed'` 字段，监控系统无法触发暴力破解告警。
**Risk**: 无法检测和告警针对账户的暴力破解行为，即使 rate limit 被绕过后也无审计轨迹。
**Recommendation**: 在登录失败处显式调用 `sqlite.writeAuditLog({ action: 'login_failed', username, ip_address })`。
**Status**: open

---

## Finding ID: F-08
**Severity**: MEDIUM
**OWASP**: A03 Injection (XSS)
**Location**: `packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx:13-20`
**Description**: SVG 内容 sanitize 使用手动正则，存在绕过向量: (1) 不过滤 `javascript:` URI；(2) 不过滤 `<foreignObject>` 内嵌 HTML；(3) `on*` 属性正则仅匹配带引号的格式，无引号格式可能绕过；(4) 不过滤 `<use href="data:...">` SVG 特有注入向量。
**Risk**: 存储型 XSS — 攻击者上传含恶意 SVG 的视图，其他用户浏览 SCADA 页面时执行 JavaScript，可窃取 JWT token。
**Recommendation**: 使用 `DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } })` 替代手动正则。
**Status**: open

---

## Finding ID: F-09
**Severity**: MEDIUM
**OWASP**: A05 Security Misconfiguration
**Location**: `packages/server/src/bootstrap.ts` — Express app 初始化
**Description**: Express 应用未使用 `helmet` 中间件。`X-Powered-By: Express` 未禁用 (泄漏框架)；无 `Content-Security-Policy`；无 `Referrer-Policy`；无 `Permissions-Policy`。Nginx 层有 HSTS/X-Frame/X-Content-Type，但直接访问 Express 端口 3001 时这些头缺失。
**Risk**: 直接 API 访问时泄漏框架版本；XSS 成功后无 CSP 保护可限制 fetch 范围。
**Recommendation**: 在 `bootstrap.ts` 添加 `app.disable('x-powered-by')` 和 `helmet()`。
**Status**: open

---

## Finding ID: F-10
**Severity**: MEDIUM
**OWASP**: A05 Security Misconfiguration
**Location**: `.env.example:85`
**Description**: `.env.example` 中 `JWT_SECRET=biocore-dev-secret-change-in-production` 与代码中 `DEFAULT_JWT_SECRET` 完全相同。虽然 `assertJwtSecretSafe()` 在 `NODE_ENV=production` 时守卫，但此守卫依赖 `NODE_ENV` 正确设置。若 `NODE_ENV` 未设置，守卫失效。
**Risk**: 攻击者知道默认 secret 后可伪造任意用户的 JWT。
**Recommendation**: 在 `.env.example` 中将 `JWT_SECRET` 替换为占位符注释而非真实默认值。
**Status**: open

---

## Finding ID: F-11
**Severity**: MEDIUM
**OWASP**: A01 Broken Access Control
**Location**: `packages/server/src/middlewares/view-acl.ts:65-68`
**Description**: Legacy view (无 owner 且 ACL 为空) 走 default-allow 逻辑，任何已认证用户均可访问。新建视图若未设置 owner_id，也进入 default-allow 状态。
**Risk**: 未配置 ACL 的 SCADA 视图暴露给所有用户，包括只读 viewer 角色可读取含敏感生产信息的视图。
**Recommendation**: 视图创建时强制设置 `owner_id = req.user.user_id`；将 default-allow 改为 default-deny，提供 migration 工具标记旧视图为 public。
**Status**: open (向后兼容设计决策)

---

## Finding ID: F-12
**Severity**: MEDIUM
**OWASP**: A08 Software and Data Integrity
**Location**: `packages/server/src/migrator.ts`
**Description**: 数据库 migration 仅支持 forward 迁移，所有 migration SQL 文件无对应 rollback 语句。上次 migration audit (SP-FX-30) 发现问题时无回滚能力。
**Risk**: 错误的 migration 部署后无法回滚，只能手动修复数据库。生产环境 migration 失败可能造成数据损坏且无恢复路径。
**Recommendation**: 为每个 migration 文件添加对应 down SQL；建立 pre-migration 自动备份流程。
**Status**: open (known architectural gap)

---

## Finding ID: F-13
**Severity**: LOW
**OWASP**: A02 Cryptographic Failures
**Location**: `packages/data-service/src/sqlite-service.ts`
**Description**: SQLite 数据库未启用 at-rest 加密。数据库包含用户凭证 hash、审计日志、批次数据、PLC 配置等信息，若文件系统被访问则内容直接可读。
**Risk**: 物理访问或文件系统漏洞导致数据泄漏。bcrypt hash 难以破解，但其他业务数据明文暴露。
**Recommendation**: 评估 SQLCipher at-rest 加密；或确保操作系统层磁盘加密 (dm-crypt/LUKS) 作为补偿控制。
**Status**: accepted-risk (工业环境物理安全通常由厂房管控)

---

## Finding ID: F-14
**Severity**: LOW
**OWASP**: A07 Identification and Authentication Failures
**Location**: `packages/server/src/index.ts:436` — JWT_EXPIRY_MS = 24h
**Description**: JWT 有效期固定 24 小时，无 refresh token 机制。用户被管理员禁用 (`is_active=0`) 后，JWT 在 24 小时内仍然有效 (服务端不维护 token 黑名单)。
**Risk**: 管理员禁用账户后，用户可在最长 24 小时内继续使用 API 和 WebSocket。对操作员账户即时吊销需求无法满足。
**Recommendation**: 实现 token 黑名单 (SQLite)；或在 authMiddleware 中增加 `is_active` 数据库二次校验；或缩短 JWT 有效期配合 refresh token。
**Status**: open

---

## Finding ID: F-15
**Severity**: LOW
**OWASP**: A07 Identification and Authentication Failures
**Location**: 全局 — MFA 未实现
**Description**: 系统无多因素认证支持，所有认证仅依赖单一密码因素。
**Risk**: 密码泄漏即等同于账户完全沦陷。对工业控制系统，单因素认证不满足 IEC 62443 Level 2+ 要求。
**Recommendation**: 为 admin/engineer 角色添加 TOTP MFA。
**Status**: open (Phase 2 功能规划)

---

## Finding ID: F-16
**Severity**: LOW
**OWASP**: A05 Security Misconfiguration
**Location**: `packages/server/src/index.ts:2488, 2512, 2538, 2631`
**Description**: Ollama AI 服务 URL 在代码中硬编码为 `http://localhost:11434`，`.env.example` 中列出的 `OLLAMA_URL` 环境变量未在代码中使用。
**Risk**: 部署灵活性受限；Ollama 必须运行在同一主机。非安全风险，但配置管理不一致。
**Recommendation**: 将 `'http://localhost:11434'` 替换为 `process.env.OLLAMA_URL || 'http://localhost:11434'`。
**Status**: open

---

## 安全 Invariant 验证 (通过)

以下安全核心机制经代码审计验证通过，符合设计要求:

| 验证项 | 结论 |
|--------|------|
| V-1: AI/animation 永不直写 PLC | PASS — animation-engine.ts 无 writeTag 导入，ai-suggestion-engine.ts 仅写 DB |
| V-2: writeTag opts.confirmed===true 强制 | PASS — tag-binding.ts:73 硬性 throw |
| V-3: WriteIntentDialog 用户感知确认 | PASS — reason≥3字符 + 显示 tag/value |
| V-4: JWT Secret 生产守卫 | PASS (附注: 依赖 NODE_ENV 正确设置，见 F-10) |
| V-5: bcrypt cost=12 | PASS — OWASP 2025 建议最低 10 |
| V-6: API Key 时序安全 | PARTIAL — JWT 路径 timingSafeEqual 通过，API Key 比较使用字符串 !== (低风险，hash 定长) |
| V-7: backup 命令注入 | PASS — scriptPath 硬编码，无用户可控参数入 spawn |
| V-8: SQL Injection | PASS — 全库使用 prepared statement，动态 SQL 构建使用参数数组 |
| V-9: CORS 生产守卫 | PASS — 缺失 ALLOWED_ORIGINS 时 process.exit(1) |
| V-10: FUXA iframe sandbox | PASS (设计接受) — URL 来自 env var，不受请求参数控制 |

---

## pnpm audit 完整摘要

```
总计: 25 vulnerabilities
  HIGH (9):
    - expr-eval <=2.0.2 (2 CVE, packages__web-ui)
    - next >=13.0.0 <15.5.16 (3 CVE, packages__web-ui)
    - basic-ftp <=5.3.0 (2 CVE, via puppeteer 传递依赖)
    - esbuild <=0.24.2 (1 CVE)
    - brace >=1.0.0 (1 CVE, via multer 传递依赖)
  MODERATE (14): next 相关缓存投毒等
  LOW (2): next middleware 重定向缓存投毒

优先处理:
  1. expr-eval — 无 patch，需替换库
  2. next — 升级至 >=15.5.16
  3. basic-ftp — 间接依赖，优先级较低
```

---

## 修复优先级建议

| 优先级 | Finding | 预估工作量 |
|--------|---------|-----------|
| P0 (立即) | F-01: AI accept 无 role 守卫 | 3行代码 |
| P0 (立即) | F-06: verifyJWT 时序漏洞 (WS) | 5行代码 |
| P1 (本 Sprint 内) | F-04: PLC 配置无 role 守卫 | 10行代码 |
| P1 (本 Sprint 内) | F-05: Phase template 无 role 守卫 | 5行代码 |
| P1 (本 Sprint 内) | F-07: 登录失败无 audit | 5行代码 |
| P2 (下 Sprint) | F-02: expr-eval CVE 替换库 | 中等 |
| P2 (下 Sprint) | F-03: Next.js 升级 | 中等 (回归测试) |
| P2 (下 Sprint) | F-08: SVG sanitize 用 DOMPurify | 小 |
| P2 (下 Sprint) | F-09: Helmet 安全头 | 小 |
| P3 (规划) | F-10: .env.example 改进 | 极小 |
| P3 (规划) | F-11: view-acl default-deny | 中等 |
| P3 (规划) | F-12: Migration rollback | 大 |
| P3 (规划) | F-14: JWT 即时吊销 | 中等 |
| P3 (规划) | F-15: MFA | 大 |
| P4 (技术债) | F-13: SQLite 加密 | 大 |
| P4 (技术债) | F-16: OLLAMA_URL 硬编码 | 极小 |
