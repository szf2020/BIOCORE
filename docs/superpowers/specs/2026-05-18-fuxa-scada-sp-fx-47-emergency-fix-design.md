# SP-FX-47 紧急修复 — 设计规范

**Sprint**: SP-FX-47 (Emergency Fix)
**日期**: 2026-05-18
**严重度**: 1 CRITICAL + 2 HIGH 安全漏洞
**参考**: SP-FX-46 安全 audit 发现

---

## 一、背景

SP-FX-46 安全 audit 发现 BIOCore 服务端存在多个访问控制漏洞，其中最严重的是 viewer 角色可通过
AI 建议接受接口直接触发 SCADA dispatcher 写 PLC，绕过了 CLAUDE.md 规定的
"AI/animation 永不直写 PLC" 硬约束。

---

## 二、修复范围

### Part 1 — F-01: AI suggestions 路由 requireRole guard (CRITICAL)

**现状**: 3 个 POST endpoint 无任何角色守卫:
- `POST /api/v1/ai/suggestions/:id/accept`
- `POST /api/v1/ai/suggestions/:id/reject`
- `POST /api/v1/ai/suggestions/:id/retry-dispatch`

**风险**: viewer 用户可通过 accept 接口将 AI 建议状态改为 `pending_dispatch`，
SCADA dispatcher 随即写 PLC，完全绕过 WriteIntentDialog 人工确认流程。
这是 CLAUDE.md 约束 "AI/animation 永不直写 PLC" 的直接 violation。

**修复方案**: 在 `packages/server/src/index.ts` 对应 3 个路由加
`requireRole('operator', 'admin')` middleware。viewer/engineer 403 Forbidden。

**测试要求**: 3-5 tests — viewer 403, operator 200, admin 200

---

### Part 2 — F-04: PLC connection/variable 路由 requireRole (HIGH)

**现状**: 6 个写操作 endpoint 无角色守卫:
- `POST /api/v1/plc/connections`
- `PUT /api/v1/plc/connections/:id`
- `DELETE /api/v1/plc/connections/:id`
- `POST /api/v1/plc/variables`
- `PUT /api/v1/plc/variables/:id`
- `DELETE /api/v1/plc/variables/:id`

**风险**: operator/viewer 可任意创建/修改/删除 PLC 拓扑配置，导致：
- 连接到未授权 PLC 设备
- 删除关键 PLC 连接导致生产中断
- 修改变量地址导致读取错误数据

**修复方案**: 全部加 `requireRole('admin')`，PLC 拓扑配置属于 admin-only 操作。
GET 只读端点不变。

**测试要求**: 6-8 tests — non-admin 403, admin 200

---

### Part 3 — F-06: WS API Key timingSafeEqual (HIGH)

**现状**: `packages/server/src/ws-server.ts` API Key 验证使用 `===` 字符串比较:
```
hashApiKey(rawKey, row.salt) === row.key_hash
```
存在 timing attack 向量。

**修复方案**: 改用 `timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(row.key_hash, 'hex'))`，
并在调用前检查两 Buffer 长度相等（防御性处理，避免 Node RangeError）。

**测试要求**: 2-3 tests

---

### Part 4 — SP-FX-43 analytics-routes (已完成)

经检查，analytics-routes 8 个测试全部通过 (server 286/286)，无需修复。

---

### Part 5 — SP-FX-42 alerts page (已完成)

经检查，`/scada2/alerts/page.tsx` 已完整实现，含 3 Tab + CRUD modal + admin 门控 + 10 tests，
web-ui 1231/1231 全通过。

---

### Part 6 — CVE 评估

跑 `pnpm audit` 列 HIGH+ CVE，写 `docs/cve-remediation-plan.md`。
本 sprint 不实际升级（留专 sprint 评估兼容性）。

---

## 三、架构决策

### AI suggestions 用 operator 而非 admin
operator 是工艺人员，接受/拒绝 AI 建议是其核心职责；admin 天然包含其中。
viewer/engineer 不应触发 PLC 写操作。

### PLC 拓扑用 admin only
PLC 连接/变量是系统配置层，错误配置可导致生产安全事故，需最高权限。

### timingSafeEqual Buffer 长度处理
hashApiKey 输出固定 64-char hex；存储的 key_hash 也是 64-char hex。
调用 timingSafeEqual 前先检查长度，防御性拒绝长度不匹配情况。

---

## 四、不变约束

- GET 只读端点不加 requireRole
- PLC 写意图路径 `opts.confirmed === true` gate 不动
- animation-engine T8 安全 invariant 不动
- 零新第三方依赖
