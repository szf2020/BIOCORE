# SP-FX-31 Hot-Swap Integration Design

**Sprint**: SP-FX-31
**Date**: 2026-05-18
**Status**: Draft

## 背景

SP-FX-17 ship 了 `GaugeRegistry.onReplace(callback)` API 及 `GaugeReplaceEvent` 类型。  
但 RuntimeCanvas 未订阅该事件，导致 widget meta 替换后，已 mount 的 gauge 实例不会 re-mount，  
页面继续运行旧实例，与新 meta 不一致。

## 目标

在 RuntimeCanvas 中订阅 `gaugeRegistry.onReplace`，当收到 replace 事件时：
1. 找到 `gaugeMapRef.current` 中所有 `widget.type === event.widgetType` 的实例
2. 对每个旧 instance: `onUnmount()` → 从 map 删除
3. 用 `event.newMeta.create()` 创建新 instance → `onMount(widget, ctx)` → 存回 map

## 范围约束

- **修改文件**: `packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx` (末尾 append Effect G)
- **新建文件**: `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeCanvas.hot-swap.test.tsx`
- **不碰**: `gauge-registry.ts` / `gauge-base.ts` / batch widgets / server / dict files / PW specs

## Effect G 设计

### 触发时机

依赖数组: `[view.id, reactorId]` — 与 Effect A 对齐，确保 view 切换时重新绑定。

### 逻辑流

```
gaugeRegistry.onReplace((event) => {
  const { widgetType, newMeta } = event;

  // 1. 找出所有 type 匹配的 widget entry
  for (const [id, w] of Object.entries(view.items)) {
    if ((w as FuxaWidget).type !== widgetType) continue;
    const widget = w as FuxaWidget;

    // 2. unmount 旧实例
    gaugeMapRef.current.get(id)?.onUnmount();
    gaugeMapRef.current.delete(id);

    // 3. mount 新实例
    const canvas = canvasRef.current;
    if (!canvas) continue;
    const newGauge = newMeta.create();
    const ctx: GaugeContext = { ... };
    newGauge.onMount(widget, ctx);
    gaugeMapRef.current.set(id, newGauge);
  }
})
```

### Cleanup

`return unsubscribe` — `gaugeRegistry.onReplace` 返回的 unsub 函数。

## GaugeContext 复用策略

Effect G 内部需构造 `GaugeContext`。当前 Effect A 内也构造了相同结构，两处保持逻辑对称。  
不提取 helper，保持 Effect 独立性，代价是少量重复（代码量 < 15 行）。

## 测试设计

文件: `RuntimeCanvas.hot-swap.test.tsx`

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | mount 1 widget → onMount 被调用 1 次 | gauge.onMount calledOnce |
| 2 | onReplace fire → 旧 gauge.onUnmount 被调用 | oldGauge.onUnmount calledOnce |
| 3 | onReplace fire → 新 gauge.onMount 被调用 | newGauge.onMount calledOnce |
| 4 | onReplace fire → gaugeMap 引用更新为新实例 | map.get(id) === newGauge |
| 5 | type 不匹配的 widget 不受影响 | 其他 gauge.onUnmount not called |
| 6 | unmount → onReplace 订阅取消 | unsubscribe called |

## 不变量保证

- Effect A/B/D/F 依赖数组、cleanup 逻辑不变
- animation-engine T8 安全 invariant 不涉及 onReplace，不受影响
- WriteIntentDialog gate 不变 (onWriteIntent 仅触发 dialog，writeTag 需 confirmed===true)
- PLC 写入路径不经过 RuntimeCanvas，不受影响

## 版本记录

- SP-FX-17: gauge-registry versioning + onReplace API foundation
- SP-FX-31: RuntimeCanvas 订阅 onReplace (本 sprint — integration)
