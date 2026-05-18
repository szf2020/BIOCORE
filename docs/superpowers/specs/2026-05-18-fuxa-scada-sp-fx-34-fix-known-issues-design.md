# SP-FX-34 Design Spec — 修 SP-FX-32 留 3 个 Known Issues

**日期**: 2026-05-18
**Sprint**: SP-FX-34
**作者**: SP-FX-34 自治 agent

---

## 背景

SP-FX-32 全 Playwright 运行后留下 3 个已知问题 (KI-1 ~ KI-3)，记录于 `docs/pw-known-issues.md`。本 Sprint 一一修复并 un-skip 相应 PW spec。

---

## KI-1: backup cwd 修复

### 问题

`backup-routes.ts` spawn 调用使用 `cwd: process.cwd()`。当 server 从 `packages/server` 目录以 `pnpm dev` 启动时，`process.cwd()` = `<repo>/packages/server`，但 `scripts/backup-db.sh` 在 repo root，导致脚本找不到，spawn 失败。

### 解决方案

改 `cwd` 为优先读 `BIOCORE_ROOT` env，fallback `path.resolve(__dirname, '../../..')`:

```ts
const repoRoot = process.env.BIOCORE_ROOT ?? path.resolve(__dirname, '../../..');
const child = spawn('bash', [scriptPath], { env, cwd: repoRoot });
```

- `__dirname` 在 tsx/ts-node = `packages/server/src`
- `../../..` = repo root
- `BIOCORE_ROOT` 可在测试中 override，可测性好

### 单元测试

在 `backup-routes.test.ts` 新增 spawn cwd 验证:
- vi.mock `node:child_process` 返回 fake EventEmitter
- POST /admin/backup
- 断言 spawn 第 3 参数 `options.cwd` = BIOCORE_ROOT（或 path.resolve 值）

---

## KI-2: soak timeout 配置

### 问题

`playwright.config.ts` 中 `chromium` project 无 `testIgnore`，默认匹配全部 spec 包含 `scada-soak.spec.ts`。Chromium timeout = 30s < soak 需要 60s，导致超时失败。

### 解决方案

在 `chromium` project 加 `testIgnore: ['**/scada-soak.spec.ts']`:

```ts
{ name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ['**/scada-soak.spec.ts'] }
```

soak project 保持 `testMatch` + `timeout: 90_000`。

---

## KI-3: scada_views svgcontent 列

### 问题

`scada_views` 表（migration 028）无 `svgcontent` 列。`ViewCard.tsx` 读 `view.svgcontent`，永远 undefined，thumbnail 渲染永远进入 placeholder，PW thumbnail spec 失败。

### 解决方案

新 migration `036-scada-views-svgcontent.sql`:

```sql
ALTER TABLE scada_views ADD COLUMN svgcontent TEXT NOT NULL DEFAULT '';
```

- backfill 空字符串：`hasSvg = svgcontent.trim().length > 0` → 旧行返回 false，不破坏现有卡片
- ViewCard.tsx 无需改动

### 单元测试

新 `036-scada-views-svgcontent.test.ts`:
- 执行 028 + 030 + 031 + 035 + 036 迁移
- 断言列存在、类型 TEXT、默认值 `''`
- 断言旧行插入成功、svgcontent = `''`
- 断言含 svgcontent 新行读回正确

---

## 文件改动范围

| 文件 | 改动类型 |
|------|---------|
| `packages/server/src/backup-routes.ts` | 修改 spawn cwd |
| `packages/web-ui/playwright.config.ts` | 加 testIgnore |
| `packages/server/migrations/036-scada-views-svgcontent.sql` | 新建 |
| `packages/server/src/__tests__/backup-routes.test.ts` | 加 spawn cwd 测试 |
| `packages/server/src/__tests__/migrations/036-scada-views-svgcontent.test.ts` | 新建 |
| `docs/pw-known-issues.md` | 新建标记 resolved |

**不改动**: ViewCard.tsx, widget, RuntimeCanvas, animation-engine, dict-en
