# SP-FX-34 执行计划 — 修 SP-FX-32 留 3 个 Known Issues

**日期**: 2026-05-18
**Sprint**: SP-FX-34

---

## Task 列表

### T1: KI-1 — backup spawn cwd 修复 + 单元测试

**文件**:
- `packages/server/src/backup-routes.ts` — 加 `resolve`，改 spawn cwd
- `packages/server/src/__tests__/backup-routes.test.ts` — 加 spawn cwd mock 测试

**步骤**:
1. import 加 `resolve` from `'node:path'`
2. `const repoRoot = process.env.BIOCORE_ROOT ?? resolve(__dirname, '../../..')`
3. spawn 改 `{ env, cwd: repoRoot }`
4. test 加 vi.mock child_process，断言 spawn cwd

**验证**: `pnpm --filter server test` 全 pass，新测试数 >= baseline+1

---

### T2: KI-2 — playwright.config testIgnore

**文件**:
- `packages/web-ui/playwright.config.ts` — chromium project 加 `testIgnore`

**步骤**:
1. chromium project 对象加 `testIgnore: ['**/scada-soak.spec.ts']`

**验证**: playwright list 验证 chromium 不含 soak

---

### T3: KI-3 — migration 036 + 单元测试 (RED-first)

**文件**:
- `packages/server/src/__tests__/migrations/036-scada-views-svgcontent.test.ts` — 先写测试（RED）
- `packages/server/migrations/036-scada-views-svgcontent.sql` — 再写 migration（GREEN）

**步骤**:
1. 先写测试: 读 036 sql 执行，PRAGMA table_info 断言 svgcontent 列存在
2. 跑测试 → RED（文件不存在）
3. 写 migration SQL
4. 跑测试 → GREEN

**验证**: `pnpm --filter server test` 全 pass，migration test pass

---

### T4: 创建 docs/pw-known-issues.md 标记 resolved

**文件**:
- `docs/pw-known-issues.md` — 新建

**步骤**:
1. 记录 3 KI 原始问题 + 修复 commit SHA + "Resolved by SP-FX-34"

**验证**: 文件存在

---

### T5: 全 vitest 确认 + tsc 检查

**步骤**:
1. `pnpm --filter server test`
2. `pnpm --filter web-ui test`

**验证**: 0 fail，count >= baseline

---

### T6: git pull --rebase + push

**步骤**:
1. `git pull --rebase origin main`
2. 解冲突（若有）
3. `git push origin main`

**验证**: remote main 更新成功

---

## 约束

- ZERO 新第三方 dep
- 不碰 ViewCard / widget / RuntimeCanvas / animation-engine / dict-en
- macOS BSD sed; 用 Edit 工具
- pnpm: `export PATH=$HOME/.hermes/node/bin:$PATH`
