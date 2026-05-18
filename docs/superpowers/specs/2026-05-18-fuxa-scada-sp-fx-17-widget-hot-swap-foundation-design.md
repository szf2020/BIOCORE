# SP-FX-17 Widget Hot-Swap Foundation — Design Spec

**日期**: 2026-05-18  
**Sprint**: SP-FX-17  
**状态**: APPROVED

---

## 1. 目标

为 gaugeRegistry 加入 versioning + replace API + 事件系统，作为下 sprint (SP-FX-18) RuntimeCanvas hot-swap 的基础。本 sprint **不集成到 RuntimeCanvas**。

---

## 2. 现状分析

当前 `gauge-registry.ts` 中：
- `GaugeMeta` interface 无 version 字段
- `register(meta)` 重复注册直接抛错，无替换路径
- 无事件系统，无法通知外部"某 widget 被替换"

---

## 3. 新 API 设计

### 3.1 GaugeMeta 扩展

```typescript
export interface GaugeMeta {
  widgetType: string;
  create: () => GaugeBase;
  getSignals: GetSignalsFn;
  version?: string;  // semver-like, 不提供时默认 '1.0.0'
}
```

`version` 为 optional，向后兼容所有现有 meta 对象。

### 3.2 GaugeReplaceEvent

```typescript
export interface GaugeReplaceEvent {
  widgetType: string;
  oldMeta: GaugeMeta;
  newMeta: GaugeMeta;
  timestamp: number;
}
```

存放于 `gauge-base.ts`，从该文件导出。

### 3.3 register 签名扩展

```typescript
register(meta: GaugeMeta, opts?: { replace?: boolean }): void
```

- `opts` 未传 / `replace: false`（默认）→ 重复注册抛 `"gauge already registered for type 'X'"`（保持原有 message，向后兼容现有测试）
- `replace: true` → 覆盖 map 中的 meta，并通过内部 EventEmitter 触发 `'replaced'` 事件

### 3.4 新增方法

```typescript
getVersion(widgetType: string): string | undefined
onReplace(callback: (event: GaugeReplaceEvent) => void): () => void
```

- `getVersion` — 返回已注册 meta 的 version；未注册则 undefined
- `onReplace` — 订阅替换事件；返回 unsubscribe 函数（调用后不再收到事件）

---

## 4. 内部实现

使用 Node.js 内置 `EventEmitter`：

```typescript
import { EventEmitter } from 'events';

private emitter = new EventEmitter();
```

无新第三方依赖。

`register` 中当 `replace: true` 时：
1. 保存 `oldMeta`
2. 存入新 meta
3. 发出 `GaugeReplaceEvent`（含 timestamp: Date.now()）

---

## 5. 向后兼容

| 项目 | 影响 |
|------|------|
| `GaugeMeta` 加 `version?` | optional 字段，现有 meta 无需改动 |
| `register(meta)` 无第二参数 | replace 默认 false，行为不变 |
| 错误 message | 保持 `"gauge already registered for type 'X'"` 原文 |
| `controls-all-registered.test.ts` | registry.size === 20 不变 |
| 现有 `gauge-registry.test.ts` 3 tests | 全部继续通过 |

---

## 6. 范围边界

**本 sprint 包含**:
- `gauge-registry.ts` versioning + replace + event API
- `gauge-registry.test.ts` 新增 8 个 unit tests

**不包含 (SP-FX-18 负责)**:
- RuntimeCanvas 监听 onReplace 并 re-mount widget
- hot-swap 的 UI 触发路径

---

## 7. 测试矩阵

| # | 描述 | 关键断言 |
|---|------|---------|
| 1 | register with version stores version | getVersion 返回指定 version |
| 2 | getVersion returns stored version | getVersion('type') === '2.0.0' |
| 3 | register without version defaults '1.0.0' | getVersion === '1.0.0' |
| 4 | duplicate widgetType throws (default) | 抛 "gauge already registered..." |
| 5 | register with { replace: true } succeeds | 不抛错，has() 仍 true |
| 6 | replace emits GaugeReplaceEvent | event.oldMeta / newMeta / widgetType / timestamp 正确 |
| 7 | onReplace subscribers receive event | callback 被调用 |
| 8 | onReplace unsubscribe stops receiving events | unsub() 后 callback 不再被调 |
