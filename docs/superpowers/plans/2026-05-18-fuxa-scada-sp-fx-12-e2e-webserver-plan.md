# SP-FX-12 实施计划: PW webServer 自启 + 全 spec 实跑 + user journey

**Sprint**: SP-FX-12  
**日期**: 2026-05-18  
**参考 spec**: `docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-12-e2e-webserver-design.md`

---

## Task 列表

### T1: playwright.config.ts 添加 webServer 配置

**文件**: `packages/web-ui/playwright.config.ts`

**操作**:
- 添加 `webServer` 数组：
  - web-ui: `pnpm dev` → 探针 `http://localhost:3000`
  - server: `cd ../../ && MOCK_PLC=true pnpm --filter server dev` → 探针 `http://localhost:3001/api/v1/status`
- 两个进程均设 `reuseExistingServer: !process.env.CI`, `timeout: 60_000`

**验证**: `pnpm --filter web-ui exec playwright test --list` 能列出测试（不报 config error）

---

### T2: 修复 scada-runtime-view.spec.ts — 动态 seed view

**文件**: `packages/web-ui/e2e/scada-runtime-view.spec.ts`

**问题**: `VIEW_ID = 'test-view-001'` 不在 DB seed 中，view-v2 页面会返回加载失败

**操作**:
- 在 describe 块顶部添加 `let dynamicViewId: string`
- 在 `beforeAll` 通过 API 创建含 svg-ext-value widget 的 view
- 将两个测试中的 VIEW_ID 替换为 dynamicViewId
- 保持测试逻辑不变

**验证**: scada-runtime-view 2 tests pass

---

### T3: 实跑全 PW spec，修复 selector/assertion 问题

**操作**:
1. 执行 playwright test，收集 pass/fail/skip
2. 分析每个 fail：selector 问题 → 修 spec；prod bug → test.skip + 记录
3. 目标: 0 fail

**验证**: 全 PW 无 FAILED 行

---

### T4: 新增端到端 user journey spec

**文件**: `packages/web-ui/e2e/scada-user-journey.spec.ts`

**测试流程**:
1. login → 验登录成功
2. API seed: 创建 view (含 svg-ext-value widget)
3. 进编辑器 → 验 toolbar 可见
4. 点 widget → 验 property panel 可见
5. 切换运行时 → 验 canvas host 可见
6. mock write-intents POST
7. 点 widget → 若 dialog 出现则验证并关闭
8. 最终断言: canvas host 仍可见

**验证**: 1 test pass

---

### T5: Regression + Push

**操作**:
1. vitest >= 982
2. tsc 无 error
3. PW 全 pass/skip
4. git push origin main

---

## 执行顺序

T1 → T2 → T3 → T4 → T5
