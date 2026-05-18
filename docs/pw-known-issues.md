# PW E2E Known Issues

记录在 SP-FX-32 全实跑中发现的已知问题及其 skip 原因。

---

## KI-1: scada-backup-ui — backup-db.sh cwd 路径问题

**Spec**: `packages/web-ui/e2e/scada-backup-ui.spec.ts`  
**Test**: `admin 访问 /scada2/backup 触发备份 新行出现 下载响应含 attachment header`  
**状态**: ~~SKIPPED (test.skip)~~ **RESOLVED by SP-FX-34 (commit 3a75069)**  
**发现于**: SP-FX-32  

### 根因

`backup-routes.ts` 中的 spawn 调用使用 `process.cwd()` 作为 cwd。server dev 模式下 cwd = `packages/server`，但 `scripts/backup-db.sh` 在 repo root。bash 找不到脚本 → exit non-zero → `res.status(500)`。

### 修复 (SP-FX-34)

- `backup-routes.ts`: 暴露 `getRepoRoot()` 函数，优先读 `BIOCORE_ROOT` env，fallback `path.resolve(__dirname, '../../..')`
- spawn cwd 改为 `getRepoRoot()`
- 加 3 个 unit test 验证 `getRepoRoot()` 行为
- **Commit**: 3a75069

---

## KI-2: scada-soak — chromium project 30s timeout 不足

**Spec**: `packages/web-ui/e2e/scada-soak.spec.ts`  
**Test**: `soak: render<5s, FPS>=30, mem<50MB, 0 errors, canvas mounted`  
**状态**: ~~SKIPPED (project name guard)~~ **RESOLVED by SP-FX-34 (commit 79f599c)**  
**发现于**: SP-FX-32  

### 根因

`--project=chromium` 时也会跑 soak spec，但 chromium project 只有默认 30s timeout，soak 测量需 60s FPS 采样 → timeout。

### 修复 (SP-FX-34)

- `playwright.config.ts`: chromium project 加 `testIgnore: ['**/scada-soak.spec.ts']`
- soak project 保持 `testMatch` + `timeout: 90_000`
- **Commit**: 79f599c

### 运行 soak test 的正确命令

```bash
pnpm --filter web-ui exec playwright test --project=soak
```

---

## KI-3: scada-thumbnail — scada_views 无 svgcontent 列

**Spec**: `packages/web-ui/e2e/scada-thumbnail.spec.ts`  
**Test**: `cards-view thumbnail SVG element 存在且包含 widget 内部元素`  
**状态**: ~~SKIPPED (test.skip)~~ **RESOLVED by SP-FX-34 (commit 81f6c57)**  
**发现于**: SP-FX-32  

### 根因

`scada_views` 表无 `svgcontent` 列 (schema 只有 `items_json`)。`ViewCard.hasSvg` 检查 `view.svgcontent`，永远 false，thumbnail-svg div 不渲染。spec 的 seedViewWithSvg 传 svgcontent 到 scada-routes，但被忽略。

### 修复 (SP-FX-34)

- 新增 `migrations/036-scada-views-svgcontent.sql`: `ALTER TABLE scada_views ADD COLUMN svgcontent TEXT NOT NULL DEFAULT ''`
- backfill 空字符串，旧行 `hasSvg = false`，不破坏现有卡片
- ViewCard.tsx 无需修改（逻辑已正确）
- 5 个 migration unit test + roll-forward T6 验证
- **Commit**: 81f6c57

---

## 汇总

| ID | Spec | 根因类别 | 状态 | 后续 Sprint |
|----|------|---------|------|-----------|
| KI-1 | scada-backup-ui | prod bug (cwd 路径) | **RESOLVED** | SP-FX-34 (3a75069) |
| KI-2 | scada-soak | 环境配置 (timeout) | **RESOLVED** | SP-FX-34 (79f599c) |
| KI-3 | scada-thumbnail | schema 设计差距 | **RESOLVED** | SP-FX-34 (81f6c57) |

*发现于 SP-FX-32 (2026-05-18) — 全部 resolved by SP-FX-34 (2026-05-18)*
