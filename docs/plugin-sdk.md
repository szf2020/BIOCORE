# BIOCore Plugin SDK 开发者指南

**Sprint**: SP-FX-45  
**版本**: 1.0.0  
**路径**: `packages/web-ui/src/scada-engine/plugins/`

---

## 1. 概述

BIOCore Plugin SDK 允许第三方开发者在不修改核心代码的情况下扩展 SCADA Widget 库。Plugin 通过标准接口注入 widget、属性 schema 和 i18n 字典。

---

## 2. Plugin 接口规范

```typescript
interface BiocorePlugin {
  id: string;                          // 全局唯一 ID（reverse-domain 格式）
  name: string;                        // 人类可读名称
  version: string;                     // semver，如 "1.0.0"
  widgets: GaugeMeta[];                // widget 元数据列表
  propertySchemas?: WidgetPropertySchema[]; // 属性 schema（与 widgets 位置对应）
  dictionaries?: {
    zh?: Record<string, string>;
    en?: Record<string, string>;
  };
  onLoad?(): void;                     // 加载后回调
  onUnload?(): void;                   // 卸载前回调
}
```

### GaugeMeta 接口

```typescript
interface GaugeMeta {
  widgetType: string;          // 唯一 widget 类型标识，如 "com-example-my-gauge"
  create: () => GaugeBase;     // 工厂函数
  getSignals: GetSignalsFn;    // 返回 widget 订阅的 tag ID 列表
  version?: string;            // semver
}
```

### GaugeBase 接口

```typescript
interface GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void;
  onUnmount(): void;
  onProcess(value: GaugeValue): void;
  onPropertyChange(change: GaugePropChange): void;
  onResize(w: number, h: number): void;
  onClick?(event: MouseEvent, ctx: GaugeClickContext): void;
}
```

---

## 3. 加载流程

```
registerPlugin(plugin)
  1. 安全检查: id/widgetType 不含 plc-driver/writeTag/modbus-serial/node-snap7
  2. 重复检查: 同 id 已注册则 throw
  3. gaugeRegistry.register(meta) × len(widgets)
  4. WIDGET_SCHEMAS[widgetType] = schema × len(propertySchemas)
  5. TODO SP-FX-46: i18n.addDictionary(locale, dict)
  6. plugin.onLoad?.()
  7. pluginStore.set(id, plugin)
```

**注意**: `unregisterPlugin` 仅从 pluginStore 移除，widget 仍留在 gaugeRegistry（已知限制，待 SP-FX-46 修复）。

---

## 4. 示例 Plugin — ClockWidget

文件: `packages/web-ui/src/scada-engine/plugins/samples/clock-widget-plugin.ts`

```typescript
import { registerPlugin } from '@/scada-engine/plugins';
import { clockWidgetPlugin } from '@/scada-engine/plugins/samples/clock-widget-plugin';

// 手动注册（sample 不自动注册）
registerPlugin(clockWidgetPlugin);
```

**ClockWidget 特性**:
- widgetType: `sample-clock`
- 每秒更新显示当前时间
- 支持属性 `format` (如 `HH:mm:ss`)
- 不订阅任何 PLC tag，纯展示

---

## 5. 编写自定义 Plugin

### 5.1 实现 GaugeBase

```typescript
import type { GaugeBase, GaugeContext, GaugeValue, GaugePropChange } from '@/scada-engine/gauges/gauge-base';
import type { FuxaWidget } from '@/scada-engine/models/widget';

class MyGauge implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    // 初始化 SVG 元素
  }
  onUnmount(): void {
    // 清理定时器/事件监听
  }
  onProcess(value: GaugeValue): void {
    // 处理 tag 值更新
  }
  onPropertyChange(change: GaugePropChange): void {
    // 处理属性变更
  }
  onResize(w: number, h: number): void {
    // 响应尺寸变化
  }
}
```

### 5.2 定义 Plugin

```typescript
import type { BiocorePlugin } from '@/scada-engine/plugins';

export const myPlugin: BiocorePlugin = {
  id: 'com.example.my-plugin',    // 全局唯一
  name: 'My Custom Plugin',
  version: '1.0.0',
  widgets: [
    {
      widgetType: 'com-example-my-gauge',
      create: () => new MyGauge(),
      getSignals: (widget) => [widget.property['variableId'] as string].filter(Boolean),
    },
  ],
  dictionaries: {
    zh: { 'my-gauge.label': '自定义仪表' },
    en: { 'my-gauge.label': 'Custom Gauge' },
  },
};
```

### 5.3 注册 Plugin

```typescript
import { registerPlugin } from '@/scada-engine/plugins';
import { myPlugin } from './my-plugin';

registerPlugin(myPlugin);
```

---

## 6. 安全约束

Plugin 遵守以下安全规则（由 loader 自动检查）：

| 规则 | 说明 |
|------|------|
| 禁止 `plc-driver` | plugin id/widgetType 中不得含此词 |
| 禁止 `writeTag` | 不得绕过 WriteIntentDialog 直接写 PLC |
| 禁止 `modbus-serial` | Modbus 驱动只能由核心层使用 |
| 禁止 `node-snap7` | S7 驱动只能由核心层使用 |

违反以上规则时 `registerPlugin` 抛出错误。

**HMI 写入**: 如需 Widget 触发写操作，必须通过 `ctx.onWriteIntent()` 走 WriteIntentDialog 确认流程。

---

## 7. Admin UI

访问 `/scada2/plugins` 可：
- 查看已加载 plugin 列表（ID / 名称 / 版本 / widget 数量）
- 加载示例 ClockWidget
- 卸载已加载 plugin

---

## 8. 后续路线 (Future Work)

### SP-FX-46: i18n 集成
开放 `i18n.addDictionary(locale, dict)` API，允许 plugin 字典自动注入全局 `useLocale` hook。

### 远程 Plugin / npm 安装
生产环境需要：
1. Plugin upload API（上传 plugin bundle）
2. 服务器端 plugin 存储与版本管理
3. 动态 `import()` 加载远程 bundle
4. Plugin 沙箱隔离（CSP / Web Worker）

### Plugin 卸载完整支持
需要在 `gaugeRegistry` 实现 `unregister(widgetType)` API 后，才能完整清除已注册 widget。

### Plugin Marketplace
未来可建立 npm-based plugin registry，允许 `npm install @biocore-plugin/xxx` 后通过配置文件自动加载。
