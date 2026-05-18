# SP-FX-29 — GitHub Actions CI 配置 实施计划

**日期**: 2026-05-18  
**Sprint**: SP-FX-29

---

## Task 列表

### T1: 创建 `.github/workflows/ci.yml`
- 三个 job: `lint-typecheck` → `vitest` → `playwright`
- `lint-typecheck`: pnpm install + build + tsc noEmit + pnpm -r lint
- `vitest`: pnpm install + build + pnpm -r test
- `playwright`: pnpm install + build + playwright install chromium + PW test chromium project
- 验证: python3 yaml.safe_load 语法检查

### T2: 创建 `.github/pull_request_template.md`
- 四节 checkbox template
- 验证: 文件存在 + 内容正确

### T3: README.md 顶部加 CI badge
- 在第一行 `# BIOCore` 后插入 badge
- 验证: grep badge URL

### T4: 运行 vitest 确保基线未破 + 提交推送
- `export PATH=...` + `pnpm -r test` 确认基线不变
- `git pull --rebase origin main`
- `git push origin main`

---

## 风险

| 风险 | 缓解 |
|------|------|
| yaml 缩进错误 | python3 yaml.safe_load 验证 |
| CI=true 引发本地 PW 问题 | CI job 中才设置，本地不受影响 |
| tsc noEmit 有隐藏错误 | 仅 lint-typecheck job 失败，不阻塞现有 test pass |
