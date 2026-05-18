# SP-FX-22 Thumbnail 高级渲染 — 设计文档

**日期**: 2026-05-18  
**Sprint**: SP-FX-22  
**状态**: 已审核

---

## 背景

SP-FX-13 ship 的 ViewCard 当前 thumbnail 实现：取 `view.svgcontent` 前 400 字符直接注入 SVG，不是真实渲染。本 sprint 升级为真实 mini SVG preview。

## 问题分析

现有 `ViewCard.tsx` 第 28 行：
```tsx
const svgSnippet = hasSvg ? view.svgcontent!.slice(0, 400) : '';
```
截断 SVG 内容会导致：
1. SVG 标签不完整（无 closing tag）
2. `viewBox` 固定写死为 `0 0 800 600`（与实际视图尺寸无关）
3. 不做任何安全过滤

## 架构决策

### 新组件：ThumbnailRenderer

独立组件，职责单一：将完整 svgcontent 渲染为缩略图。

**Props 接口**:
```tsx
interface ThumbnailRendererProps {
  svgcontent: string;
  width?: number;          // 容器宽度，默认 "100%"（CSS）
  height?: number;         // 容器高度，默认 80
  viewWidth: number;       // SVG 逻辑宽度（canvas 宽，默认 800）
  viewHeight: number;      // SVG 逻辑高度（canvas 高，默认 600）
}
```

**渲染策略**:
- 外层 `<svg>` 设 `viewBox="0 0 viewWidth viewHeight"` + `preserveAspectRatio="xMidYMid meet"`
- `width="100%"` + `height` 像素值 → 浏览器自动缩放
- 内部 svgcontent 通过 `dangerouslySetInnerHTML` 注入（SVG 来自受信服务端）

**安全 sanitize**（防御性，非功能性必须）:
- strip `<script...>...</script>` （含多行）
- strip ` on\w+="..."` 事件属性
- 正则简单，不引入第三方库

### ViewCard 改造

将现有 thumbnail 区域（前 400 char truncate）替换为 `<ThumbnailRenderer>`：
- 保留外层 `div`（height:80, overflow:hidden 等样式）
- 保留 `data-testid="view-card-thumbnail-svg"` → 移到 ThumbnailRenderer 内部 SVG
- `viewWidth`/`viewHeight` 来自 `ViewMeta`，但当前 ViewMeta 没有这两个字段 → 使用默认值 800/600（与 `defaultEmptyView` 一致）

> **注**: ViewMeta 接口暂不扩展 width/height（超出范围）。ThumbnailRenderer 的 viewWidth/viewHeight 在 ViewCard 调用处直接传常量 800/600。

### E2E 测试

在 `scada-thumbnail.spec.ts`：
- 登录 → /scada2 → seed 一个含 svgcontent 的 view（含 `<rect>` widget）
- 断言 cards-view 中 thumbnail SVG element 存在
- 断言 SVG 内部含目标 widget 元素（例如 `rect`）

---

## 测试覆盖（ThumbnailRenderer 单元测试，6-8 个）

1. 无 svgcontent 时不渲染（或渲染空 SVG）
2. 有 svgcontent → 渲染 `data-testid="thumbnail-svg"` SVG
3. viewBox 正确拼接 viewWidth/viewHeight
4. sanitize: strip `<script>` tags
5. sanitize: strip `on*` 事件属性
6. svgcontent 内容注入到 SVG 内部（保留合法元素）
7. 默认 height=80 应用
8. preserveAspectRatio 属性存在

---

## 文件范围（严格）

| 文件 | 操作 |
|------|------|
| `packages/web-ui/src/components/scada/pages/ThumbnailRenderer.tsx` | 新建 |
| `packages/web-ui/src/components/scada/pages/__tests__/ThumbnailRenderer.test.tsx` | 新建 |
| `packages/web-ui/src/components/scada/pages/ViewCard.tsx` | 改 thumbnail 区域 |
| `packages/web-ui/e2e/scada-thumbnail.spec.ts` | 新建 |

**不碰**: ViewListPanel, ViewListSearchBar, RuntimeCanvas, widgets, server, plc-driver

---

## 约束确认

- ZERO 新第三方依赖（sanitize 用 regex）
- TDD RED-first（先写测试，再实现）
- macOS BSD sed → 用 Edit tool
- pnpm: `export PATH=$HOME/.hermes/node/bin:$PATH`
- 基线 1046 → 期望 +8-10 → 目标 1054-1056
