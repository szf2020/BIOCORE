# SP-FX-41 设计规格 — View Templates (视图模板库)

## 概要

BIOCore SCADA 现有画面均从空白起建。本 sprint 添加 5 个预建模板，涵盖典型生化反应器拓扑，加速 onboarding。模板以静态 JSON 打包进 web-ui bundle（无额外 server endpoint）。

## 架构

```
packages/web-ui/src/scada-engine/templates/
  cstr.json                 ← CSTR 连续搅拌反应器 (8 widgets)
  pfr.json                  ← PFR 活塞流反应器 (7 widgets)
  fedbatch.json             ← Fed-batch 流加批式 (10 widgets)
  bioreactor.json           ← Bioreactor 复杂生物反应器 (14 widgets)
  simple-dashboard.json     ← 简单 dashboard 温度+流量+pH (5 widgets)
  index.ts                  ← export BUILTIN_TEMPLATES: BuiltinTemplate[]

packages/web-ui/src/components/scada/templates/
  TemplateGallery.tsx       ← modal，展示 5 card，click → callback
  __tests__/
    TemplateGallery.test.tsx ← 6 tests (RED-first)

packages/web-ui/src/components/scada/pages/
  TemplatePicker.tsx        ← 已有；加 "内置模板" section

docs/templates.md           ← template 设计指南
```

## Template JSON 结构 (FuxaView schema)

每个 JSON 文件完全符合 `FuxaViewSchema` (hmi.ts)：

```jsonc
{
  "id": "builtin-cstr",
  "name": "CSTR 连续搅拌反应器",
  "type": "svg",
  "svgcontent": "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='680'></svg>",
  "width": 900,
  "height": 680,
  "items": {
    "w1": { "id": "w1", "type": "tank", "name": "主反应槽",
      "property": {}, "x": 100, "y": 60, "w": 180, "h": 240 }
  },
  "variables": {},
  "schemaVersion": 1
}
```

## 5 个模板 Widget 清单

| 模板 | widget 数 | 类型组合 |
|------|----------|---------|
| CSTR | 8 | tank×1, pump×1, valve×2, indicator×2, label×1, lamp×1 |
| PFR | 7 | label×2, indicator×3, valve×1, pump×1 |
| Fed-batch | 10 | tank×2, pump×2, valve×2, indicator×2, lamp×1, trend×1 |
| Bioreactor | 14 | tank×1, pump×2, valve×3, indicator×4, lamp×2, trend×1, button×1 |
| Simple dashboard | 5 | indicator×3, label×1, trend×1 |

## BuiltinTemplate 类型 (index.ts)

```ts
export interface BuiltinTemplate {
  id: string;          // "builtin-cstr" 等
  name: string;        // 显示名
  description: string; // 简短中文描述
  widgetCount: number;
  view: FuxaView;      // 完整 JSON 数据
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[]
```

## TemplateGallery 组件 API

```tsx
interface TemplateGalleryProps {
  open: boolean;
  onUseTemplate: (template: BuiltinTemplate) => void;
  onUseBlank: () => void;
  onClose: () => void;
}
```

Modal overlay，内部 5 card，各含：名称 + 描述 + widget 数量 badge + "使用此模板" 按钮。顶部有 "空白画面" 选项。

## TemplatePicker 集成

现有 `TemplatePicker.tsx` 通过 `useTemplates` hook 从 server 取 templates。新增：
- 在 picker 上方加 "内置模板" 分组 (`data-testid="builtin-templates-section"`)
- 5 个静态按钮，点击 → `onPick("__builtin__:<id>")`
- server 模板分组保持不变（向后兼容）

## 数据流

```
用户点 "新建画面"
  → TemplatePicker modal 弹出
     ├── 内置模板分组 (BUILTIN_TEMPLATES, 本地静态)
     └── 项目模板分组 (useTemplates, server API)
  → 用户选内置模板 "builtin-cstr"
     → onPick("__builtin__:builtin-cstr")
  → 调用方解析前缀，从 BUILTIN_TEMPLATES 取 view JSON
  → POST /api/v1/scada/projects/{id}/views 含模板内容
```

## 测试计划

### TemplateGallery.test.tsx (6 tests)
1. 渲染 5 个 template card + 空白按钮
2. onUseTemplate 回调含正确 template 对象
3. onUseBlank 被调用
4. onClose 被调用 (点 X 按钮)
5. open=false 时 modal 不渲染
6. 各 card 显示 widgetCount badge

### TemplatePicker 补充 (+5 tests)
1. 显示 "内置模板" 分组标题
2. 5 个内置模板按钮均渲染
3. 点内置模板 → onPick 含 `__builtin__:` 前缀
4. "空白" button 仍可用
5. server 模板分组与内置模板分组共存

## 约束

- ZERO 新第三方 dep
- 不碰 server / RuntimeCanvas / widgets / dict / migrations / nginx
- template JSON 完全符合 FuxaViewSchema
- 不写 PLC，无 writeTag 调用
