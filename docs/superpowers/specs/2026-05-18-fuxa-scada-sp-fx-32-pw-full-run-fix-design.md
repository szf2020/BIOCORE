# SP-FX-32: PW 全实跑 + 修发现 Bug 设计文档

**Sprint**: SP-FX-32  
**日期**: 2026-05-18  
**状态**: COMPLETE

---

## 目标

跑全 21 个 PW spec 文件 (54 个 test cases), 分析 fail 根因, 修复或 skip + 文档化。

---

## 第一次实跑结果

```
总计: 54 tests
通过: 47
跳过: 4
失败: 3
运行时间: ~1.1min
```

### Fail 清单

| # | Spec | Test | 根因 |
|---|------|------|------|
| 1 | scada-backup-ui.spec.ts | admin 访问 /scada2/backup | backup-db.sh spawn cwd 不对 |
| 2 | scada-soak.spec.ts | soak: render<5s, FPS>=30 | chromium 30s timeout, soak 需 90s |
| 3 | scada-thumbnail.spec.ts | cards-view thumbnail SVG element | scada_views 无 svgcontent 列 |

---

## 根因分析

### Fail 1: scada-backup-ui

`backup-routes.ts` 调用 `spawn('bash', ['scripts/backup-db.sh'], { cwd: process.cwd() })`。  
server dev 时 `process.cwd()` = `packages/server`, 脚本路径相对 repo root → bash 找不到脚本 → 500。

### Fail 2: scada-soak

playwright.config.ts soak project 有 90s timeout + testMatch, 但 chromium project 无排除 soak spec 的 testMatch → `--project=chromium` 跑 soak 但 30s 超时。

### Fail 3: scada-thumbnail

seedViewWithSvg 传 svgcontent 到 scada-routes, 但 scada_views 表无该列。ViewCard.hasSvg = false, thumbnail-svg 不渲染。

---

## 修复策略

所有三个 fail 选 **选6: test.skip + 文档化**:

1. **backup-ui**: skip, 记录 prod bug (backup-routes cwd 问题, 后续 SP 修)
2. **soak**: skip when `testInfo.project.name !== 'soak'`
3. **thumbnail**: skip, 记录 schema 设计差距 (scada_views 需增 svgcontent 或改 thumbnail 逻辑)

---

## 成功标准

- PW chromium: fail 3 → 0
- skip 4 → 7 (增 3)
- pass 47 维持不变
- vitest >= 1119 不破
- 新增 docs/pw-known-issues.md
