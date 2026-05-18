# BIOCore SCADA 视图模板指南

## 概述

BIOCore 提供 5 个内置视图模板，帮助用户快速搭建典型生化反应器监控画面。模板以静态 JSON 打包进 web-ui bundle，无需额外 server endpoint。

## 内置模板列表

| 模板 | ID | Widget 数 | 用途 |
|------|----|----------|------|
| CSTR 连续搅拌反应器 | `builtin-cstr` | 8 | 连续搅拌罐式反应器监控 |
| PFR 活塞流反应器 | `builtin-pfr` | 7 | 管式活塞流反应器监控 |
| Fed-batch 流加批式 | `builtin-fedbatch` | 11 | 流加批式反应器监控 |
| Bioreactor 生物反应器 | `builtin-bioreactor` | 14 | 完整生物反应器监控 |
| 简单仪表盘 | `builtin-simple-dashboard` | 5 | 基础过程参数监控 |

## 使用模板

1. 在视图列表页点击 "新建画面"
2. 在 TemplatePicker 的 "内置模板" 分组选择所需模板
3. 系统将模板 JSON 内容加载并创建新画面
4. 在编辑器中按需修改 widget 绑定和布局

## 模板文件位置

```
packages/web-ui/src/scada-engine/templates/
  cstr.json
  pfr.json
  fedbatch.json
  bioreactor.json
  simple-dashboard.json
  index.ts          ← 导出 BUILTIN_TEMPLATES
```

## 添加新模板

### 步骤 1: 创建 JSON 文件

在 `packages/web-ui/src/scada-engine/templates/` 新建 `<name>.json`：

```json
{
  "id": "builtin-<name>",
  "name": "模板显示名",
  "type": "svg",
  "svgcontent": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"900\" height=\"680\"></svg>",
  "width": 900,
  "height": 680,
  "items": {
    "w1": {
      "id": "w1",
      "type": "tank",
      "name": "示例罐体",
      "property": { "options": { "label": "罐体", "unit": "L" } },
      "x": 100, "y": 100, "w": 200, "h": 280
    }
  },
  "variables": {},
  "schemaVersion": 1
}
```

**约束：**
- `id` 必须以 `builtin-` 开头
- `schemaVersion` 必须为 `1`
- `type` 使用 `"svg"`
- 所有 widget 的 `property` 必须包含 `{}` 或有效 FuxaProperty

### 步骤 2: 注册到 index.ts

在 `packages/web-ui/src/scada-engine/templates/index.ts` 添加：

```ts
import myTemplateJson from './<name>.json';

// 在 BUILTIN_TEMPLATES 数组中添加：
{
  id: 'builtin-<name>',
  name: '模板显示名',
  description: '简短中文描述，说明此模板适用场景',
  widgetCount: <实际 widget 数量>,
  view: myTemplateJson as FuxaView,
},
```

### 步骤 3: 验证

```bash
cd packages/web-ui
npx vitest run src/components/scada/templates
npx vitest run src/components/scada/pages/__tests__/TemplatePicker.test.tsx
```

## 可用 Widget 类型

| 类型 | 说明 | 典型用途 |
|------|------|---------|
| `tank` | 罐体（液位显示）| 反应槽、补料槽 |
| `pump` | 泵 | 进料泵、循环泵 |
| `valve` | 阀门 | 进料阀、出料阀 |
| `indicator` | 数值表 | 温度、pH、流量 |
| `trend` | 趋势图 | 过程曲线 |
| `label` | 文本标签 | 标题、说明 |
| `lamp` | 指示灯 | 运行状态、报警 |
| `button` | 按钮 | 操作触发（走 WriteIntentDialog） |

## 安全约束

- 模板 widget 不直接写 PLC。需要写操作时，通过 WriteIntentDialog (`requireConfirm: true`)
- button widget 的 `action` 触发 HMI 层，不绕过 write intent gate
- AI/自动化模块不能通过模板直接写 PLC
