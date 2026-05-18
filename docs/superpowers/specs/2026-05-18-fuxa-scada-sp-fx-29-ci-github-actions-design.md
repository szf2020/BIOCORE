# SP-FX-29 — GitHub Actions CI 配置 设计文档

**日期**: 2026-05-18  
**Sprint**: SP-FX-29  
**范围**: `.github/` 配置 + README badge  
**基线**: web-ui 1113 tests / server 188 tests (不得减少)

---

## 1. 背景与目标

BIOCore 目前已有 `unit-tests.yml`（`pnpm -r test`）和 `soak.yml`（self-hosted 24h）。  
但缺少对前端类型检查、ESLint、以及 Playwright E2E 的 CI 覆盖。

**本 Sprint 目标**：补全主 CI workflow，覆盖 lint + typecheck + vitest + Playwright，并加 PR template 和 README badge。

---

## 2. 技术决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| Node 版本 | 20.x | engines 字段要求 ≥20 |
| pnpm 版本 | 10 | packageManager 字段 = pnpm@10.x |
| Cache 策略 | `actions/setup-node` cache: pnpm | 与现有 unit-tests.yml 一致 |
| Playwright 浏览器 | chromium only | CI 资源最小化；soak.yml 已独立处理全浏览器 |
| CI env | `CI=true` | playwright.config.ts `reuseExistingServer: !process.env.CI` 依赖此变量 |
| 运行顺序 | lint-typecheck → vitest → playwright (needs) | 快速失败：类型错误最先暴露 |

---

## 3. Workflow 结构

```
ci.yml
├── trigger: push to main + pull_request
└── jobs:
    ├── lint-typecheck
    │   ├── pnpm install --frozen-lockfile
    │   ├── pnpm -r build              # 生成 dist/ 供 tsc 使用
    │   ├── tsc --noEmit (每个有 tsconfig 的包)
    │   └── pnpm -r lint (web-ui next lint)
    ├── vitest
    │   ├── needs: lint-typecheck
    │   ├── pnpm install --frozen-lockfile
    │   ├── pnpm -r build
    │   └── pnpm -r test               # 全部包 vitest run
    └── playwright
        ├── needs: vitest
        ├── pnpm install --frozen-lockfile
        ├── pnpm -r build
        ├── playwright install --with-deps chromium
        └── pnpm --filter @biocore/web-ui exec playwright test --project=chromium
```

---

## 4. PR Template 内容

四节：**描述** / **测试步骤** / **影响范围** / **Breaking Changes**。简洁 checkbox 格式。

---

## 5. README Badge

在 `README.md` 第一行标题后插入 GitHub Actions status badge，指向 `ci.yml` workflow。

Badge URL 格式：  
`https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg`

> 注：owner/repo 占位符 `biocore-org/biocore`，上线后替换为真实 repo 路径。

---

## 6. 不在范围内

- 不修改任何 `packages/*` 源代码或测试
- 不修改现有 `unit-tests.yml` / `soak.yml`
- 不增加第三方 npm 依赖
- 不触碰 animation-engine 安全 invariant (T8)
