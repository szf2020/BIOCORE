# SP-FX-12 设计文档: PW webServer 自启 + 全 8 PW spec 实跑 + 端到端 user journey

**Sprint**: SP-FX-12  
**日期**: 2026-05-18  
**文件名**: `sp-fx-12-e2e-webserver`

---

## 1. 背景与目标

### 现状

- `packages/web-ui/playwright.config.ts` 无 `webServer` 配置 — PW 测试需手动起 web :3000 + server :3001
- 4 个 PW spec 文件 (scada-smoke / scada-editor-controls / scada-runtime-view / scada-widgets-e2e) 共约 13 个测试，全未在自动环境下实跑验证
- 已有 `admin`/`admin123` 认证 seed、`biocore.db` 文件在 `packages/server/data/`
- server 提供 `/api/v1/status` (PUBLIC_PATHS 免 auth) 作为健康检查端点

### 目标

1. `playwright.config.ts` 添加 `webServer` 自动启动 web + server
2. 实跑全部 PW spec，修复 selector/assertion bug
3. 新增 1 个端到端 user journey spec (`scada-user-journey.spec.ts`)
4. regression + push

---

## 2. Part 1: playwright.config.ts webServer 配置

### 方案设计

```typescript
webServer: [
  {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  {
    command: 'MOCK_PLC=true pnpm --filter server dev',
    url: 'http://localhost:3001/api/v1/status',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
]
```

**关键决策**:
- server 命令从 web-ui 目录通过 `--filter server` 跨包启动（需 pnpm workspace）
- 使用 `/api/v1/status` (PUBLIC_PATHS 免 auth) 作为 readiness 探针
- `MOCK_PLC=true` 内联注入，避免真 PLC 连接
- `reuseExistingServer: !process.env.CI` — 本地开发可复用已跑服务器，CI 总是新起
- DB 已有 `packages/server/data/biocore.db`（含 admin 用户）

### seed 验证

- `admin`/`admin123` 用户由现有 DB migration 创建
- `test-view-001` (scada-runtime-view.spec.ts 依赖的 VIEW_ID) 不在 seed-demo.sql 中 → spec 内通过 API 自动 seed
- scada-runtime-view spec 内添加 `beforeEach` 通过 API 创建该 view

---

## 3. Part 2: 全 PW spec 分析与预期修复

### 当前 spec 文件清单

| 文件 | 测试数 | 状态 |
|------|--------|------|
| scada-smoke.spec.ts | 5 | 未实跑 |
| scada-editor-controls.spec.ts | 2 | 未实跑 |
| scada-runtime-view.spec.ts | 2 | 未实跑 |
| scada-widgets-e2e.spec.ts | 4 | 未实跑 |

**总计**: 13 个测试

### 预期问题与修复

1. **scada-runtime-view `test-view-001`**: 不在 seed → spec 内通过 `seedViewWithWidget` API 创建，使用动态 viewId，并通过 env/test.use 传入
2. **scada-smoke write-intent/view-list**: 已有 `test.skip` 条件保护，无需修改
3. **webServer 路径**: `pnpm --filter server dev` 需从 repo root 执行，但 playwright.config.ts 在 web-ui 包目录 → 使用 `cd ../../ && MOCK_PLC=true pnpm --filter server dev`

### 修复原则

- spec bug (selector 错误) → 修 spec
- prod bug → 记录为 known issue（不修 prod）
- seed 数据缺失 → spec 内部通过 API 自动 seed
- 不破坏任何 spec 原意

---

## 4. Part 3: 端到端 user journey spec

### 文件: `e2e/scada-user-journey.spec.ts`

**流程** (1 个完整 test):

```
1. login → 验登录成功
2. API seed: 创建带 svg-ext-value widget 的 view
3. 导航 /scada2/edit-v2/<viewId> → 验编辑器加载 (data-panel="toolbar")
4. 点击画布 widget → 验 property panel 可见
5. 修改 label → 点 save
6. 导航 /scada2/view-v2/<viewId>?reactor=F01 → 验运行时 canvas host 可见
7. mock POST /api/v1/scada/write-intents → 返回 {ok:true}
8. 尝试点 widget → 若 WriteIntentDialog 出现则验证并关闭
9. 验 canvas host 仍可见 (主断言)
```

**覆盖链路**: SP-FX-4 (editor) / SP-FX-5 (routing) / SP-FX-6 (controls) / SP-FX-7 (runtime) / SP-FX-11 (registry)

**设计决策**:
- 使用 `svg-ext-value` 类型（最简 widget，batch1 注册）
- WriteIntentDialog 通过 route mock 避免真实 POST 依赖
- test 内自 seed view，无 cleanup（保持简单）

---

## 5. Part 4: Regression + Push

### 验证序列

```
1. pnpm --filter web-ui test          # vitest (baseline >= 982)
2. pnpm -r tsc --noEmit               # tsc 类型检查
3. pnpm --filter web-ui exec playwright test --project=chromium --reporter=list
4. git push origin main
```

### 成功标准

- vitest 总数 >= 982
- tsc 无新增 error
- PW: 13 tests 全 pass 或 skip（无 fail）
- push 成功

---

## 6. 约束

- macOS BSD sed — 所有文件修改用 Edit 工具
- MOCK_PLC=true 必须（内联到 webServer command）
- ZERO 新第三方依赖
- 不破 animation-engine.ts T8 安全不变量
- writeTag opts.confirmed===true 严格 gate
- AI/animation 永不直写 PLC

---

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| webServer 起动超时 | timeout: 60_000，server 用 tsx watch 快速启动 |
| next dev 端口冲突 | reuseExistingServer: !process.env.CI |
| test-view-001 不存在 | spec 内通过 API 动态 seed |
| PW console error 误报 | filter Warning: 前缀的 React 警告 |
| DB schema 不兼容 | 使用现有 biocore.db，不重建 |
| webServer 无法从 web-ui 目录启动 server | cd 到 repo root 后执行 pnpm --filter server |
