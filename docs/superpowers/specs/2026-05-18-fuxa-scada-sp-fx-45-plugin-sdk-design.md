# SP-FX-45 Plugin SDK Foundation — 设计规范

**Sprint**: SP-FX-45  
**日期**: 2026-05-18  
**作者**: 自治 agent  

---

## 1. 背景

BIOCore SCADA 引擎现有 20 个内置 widget，全部硬编码在 gauge-registry 中。第三方定制化（客户自建 widget）需要一个标准化的 plugin 扩展机制。SP-FX-17 已交付 `gaugeRegistry.register()` + hot-swap 基础，本 sprint 在此基础上构建 Plugin SDK。

---

## 2. 范围

新建以下文件（严格不改动现有文件）：

| 文件 | 说明 |
|------|------|
| `packages/web-ui/src/scada-engine/plugins/types.ts` | Plugin contract 接口定义 |
| `packages/web-ui/src/scada-engine/plugins/loader.ts` | Plugin 注册/注销/列举 |
| `packages/web-ui/src/scada-engine/plugins/samples/clock-widget-plugin.ts` | 示例 plugin |
| `packages/web-ui/src/scada-engine/plugins/index.ts` | barrel 导出 |
| `packages/web-ui/src/app/scada2/plugins/page.tsx` | Admin UI |
| `docs/plugin-sdk.md` | 开发者文档 |
| 各 `__tests__/*.test.ts(x)` | TDD 测试文件 |

---

## 3. Plugin Contract (types.ts)

```typescript
interface BiocorePlugin {
  id: string;                          // 全局唯一 ID，如 "com.example.clock"
  name: string;                        // 人类可读名称
  version: string;                     // semver，如 "1.0.0"
  widgets: GaugeMeta[];                // 注入 gaugeRegistry 的 widget
  propertySchemas?: WidgetPropertySchema[]; // 注入 WIDGET_SCHEMAS
  dictionaries?: {
    zh?: Record<string, string>;       // 中文 i18n kv
    en?: Record<string, string>;       // 英文 i18n kv
  };
  onLoad?(): void;                     // plugin 加载后回调
  onUnload?(): void;                   // plugin 卸载前回调
}
```

**安全约束**（在 loader 中执行，非 types 层）：
- plugin 的 `id` 不得包含禁用字符串列表中的词（plc-driver, writeTag 等）
- widgets 的 `widgetType` 不得以 `plc-` 开头

---

## 4. Plugin Loader (loader.ts)

### 4.1 API

```typescript
export function registerPlugin(plugin: BiocorePlugin): void
export function unregisterPlugin(id: string): void
export function listPlugins(): ReadonlyArray<BiocorePlugin>
```

### 4.2 内部结构

- `pluginStore: Map<string, BiocorePlugin>` — 内存注册表
- `registerPlugin` 流程：
  1. 验证 `plugin.id` 非空、无禁用词
  2. 检查 `id` 未重复注册（重复则 throw）
  3. 注册每个 `widget` 到 `gaugeRegistry.register(meta, { replace: false })`
  4. 注册每个 `propertySchema` 到 `WIDGET_SCHEMAS`（通过 widget type key）
  5. TODO SP-FX-46: 若 i18n addDictionary API 存在则调用；否则跳过（stub）
  6. 调用 `plugin.onLoad?.()`
  7. 存入 `pluginStore`

- `unregisterPlugin` 流程：
  1. 查找 plugin，不存在则静默返回
  2. 调用 `plugin.onUnload?.()`
  3. 从 `pluginStore` 删除
  4. 已知限制：gaugeRegistry 无 unregister API（不改现有代码）— widget 仍在 registry

### 4.3 禁止检查

```typescript
const FORBIDDEN_TERMS = ['plc-driver', 'writeTag', 'modbus-serial', 'node-snap7'];
```
loader 在 registerPlugin 时检查 `plugin.id` 和 widgetType 中是否含以上词，违规则 throw。

---

## 5. Sample Plugin — ClockWidget (samples/clock-widget-plugin.ts)

### 5.1 功能

显示当前时间，每秒自动刷新。纯展示，无 PLC 读写。

### 5.2 ClockGauge 结构

```typescript
class ClockGauge implements GaugeBase {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private textEl: SVGTextElement | null = null;

  onMount(widget, ctx): void  // 创建 SVG text 元素，启动 setInterval
  onUnmount(): void           // clearInterval
  onProcess(value): void      // 无需处理（时钟不订阅 tag）
  onPropertyChange(change): void  // 处理 format 属性变更
  onResize(w, h): void        // 调整文本位置
}
```

### 5.3 Plugin 定义

```typescript
export const clockWidgetPlugin: BiocorePlugin = {
  id: 'com.biocore.sample.clock',
  name: '时钟示例 Widget',
  version: '1.0.0',
  widgets: [{ widgetType: 'sample-clock', create: () => new ClockGauge(), getSignals: () => [] }],
  propertySchemas: [{ entries: [{ key: 'format', label: '时间格式', type: 'text', placeholder: 'HH:mm:ss' }] }],
  dictionaries: { zh: { 'sample.clock': '时钟' }, en: { 'sample.clock': 'Clock' } },
};
```

不自动注册，仅导出，需手动 `registerPlugin(clockWidgetPlugin)`。

---

## 6. Admin UI (app/scada2/plugins/page.tsx)

- 页面标题: "Plugin 管理"
- 表格展示已加载 plugin: ID / 名称 / 版本 / widget 数量 / 操作（卸载）
- 底部加载 sample plugin 的 Demo 按钮
- 纯 client component，无持久化
- 错误态: alert 显示错误信息

---

## 7. i18n 集成策略

useLocale 的 DICTS 是模块内静态对象，不暴露 addDictionary API。本 sprint 策略：

- loader 存储 plugin dictionaries 在 pluginStore 中
- Admin UI 直接访问 plugin.dictionaries（不走 useLocale hook）
- 在 registerPlugin 内添加 `// TODO SP-FX-46: 集成 i18n.addDictionary` 注释

---

## 8. 安全 Invariant

| 约束 | 执行位置 |
|------|---------|
| plugin 不得调用 plc-driver/writeTag | loader.registerPlugin 验证 id + widgetType |
| HMI 写入走 WriteIntentDialog | 现有机制，plugin widget 不新增路径 |
| animation-engine T8 invariant | 不碰 animation 代码 |
| gaugeRegistry 不破坏 | 只调用 register()，不修改源文件 |

---

## 9. 已知限制（Future Work）

- unregisterPlugin 无法从 gaugeRegistry 移除 widget（registry 无 unregister API）
- i18n 字典扩展需 SP-FX-46 开放 addDictionary 接口
- 远程 plugin / npm 安装需 plugin upload API（production future）
- propertySchemas 目前通过数组位置与 widgets 对应，未来可改为 Map<widgetType, schema>

---

## 10. 测试计划

| 模块 | 测试数 | 覆盖点 |
|------|--------|--------|
| types.ts | 4 | interface 类型约束（compile-time + runtime duck-type） |
| loader.ts | 8 | register/unregister/list + 安全拒绝 + 重复注册报错 |
| clock-widget-plugin.ts | 6 | onMount/onUnmount/onProcess/plugin 结构/禁止自动注册 |
| plugins/page.tsx | 5 | 渲染列表/加载/卸载/错误展示 |

总计: +23 tests（baseline 1157 → 目标 1180+）
