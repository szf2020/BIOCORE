# SP-FX-41 执行计划 — View Templates (视图模板库)

## 任务清单

### T1: 创建 5 个 template JSON 文件
- 目标目录: `packages/web-ui/src/scada-engine/templates/`
- 文件: `cstr.json`, `pfr.json`, `fedbatch.json`, `bioreactor.json`, `simple-dashboard.json`
- 每个 JSON 完全符合 FuxaViewSchema (schemaVersion: 1)
- 验证: JSON.parse + FuxaViewSchema.parse 无报错

### T2: 创建 templates/index.ts
- 定义 `BuiltinTemplate` interface
- import 5 个 JSON, 组装 `BUILTIN_TEMPLATES: BuiltinTemplate[]`
- export `BUILTIN_TEMPLATES`
- 验证: TypeScript 编译通过

### T3 (RED): 写 TemplateGallery 测试 (TDD RED)
- 新文件: `packages/web-ui/src/components/scada/templates/__tests__/TemplateGallery.test.tsx`
- 6 个测试，全部 RED (组件未创建)
- 验证: `vitest run TemplateGallery.test.tsx` → 6 FAIL

### T4 (GREEN): 实现 TemplateGallery.tsx
- 新文件: `packages/web-ui/src/components/scada/templates/TemplateGallery.tsx`
- modal, 5 card, open/onClose/onUseTemplate/onUseBlank props
- 验证: `vitest run TemplateGallery.test.tsx` → 6 PASS

### T5 (RED): 补充 TemplatePicker 测试 (TDD RED)
- 在现有 `TemplatePicker.test.tsx` 末尾增加 5 个测试 (builtin section)
- 验证: 新增 5 tests RED

### T6 (GREEN): 修改 TemplatePicker.tsx 加入内置模板分组
- 在现有 `TemplatePicker.tsx` 加 "内置模板" section
- 使用 `BUILTIN_TEMPLATES`
- onPick 传 `"__builtin__:<id>"` 格式
- 验证: 新增 5 tests GREEN, 原有 7 tests 仍 GREEN

### T7: 写 docs/templates.md
- 内容: template 设计原则 + 添加新 template 指南
- 验证: 文件存在且内容完整

### T8: tsc + vitest full run
- `npx tsc --noEmit`
- `npx vitest run packages/web-ui`
- 记录通过 test 数

### T9: git commit + push
- commit 1: spec + plan
- commit 2: T1+T2 (template JSONs + index.ts)
- commit 3: T3 RED tests
- commit 4: T4+T5+T6 GREEN impl + TemplatePicker tests
- commit 5: T7 docs
- `git pull --rebase origin main && git push origin main`

## 成功标准

- 5 个 template JSON 文件存在且通过 schema 验证
- TemplateGallery 6 tests GREEN
- TemplatePicker 原 7 + 新 5 = 12 tests GREEN
- tsc 无新增 error
- web-ui 通过 tests 不少于 baseline
- docs/templates.md 存在
