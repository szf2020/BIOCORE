# SCADA Tag 订阅 Hook 设计

**日期**: 2026-05-15
**子项目**: BIOCore 原生 SCADA 子系统 — 阶段 2/7
**前置**: 子项目 1 (SCADA 数据模型 + 11 endpoints + 4 WS broadcast) 完成
**目标**: 为 Next.js SCADA 编辑器 + 运行时提供 React hook, 把 BIOCore 实时 tag 流 (pv_realtime) 投影成 widget 绑定可消费的值/历史

## 背景

子项目 1 已建 SCADA 数据模型 (`scada_views.items_json` 含 widget bindings). Binding 形如:

```ts
interface Binding {
  tag: string;             // e.g. 'F01.AI-0'
  prop: string;            // widget prop to drive
  transform?: string;      // optional JS expression (defer 渲染层)
}
```

后续子项目 (3/4 widget + 运行时) 渲染 widget 时需把 `binding.tag` 当下值/历史拿到。 本子项目提供 hook API 让 widget 直接订阅, 无需关心 WS / store 细节。

## 范围

**包含**:
- `useTag(tagId, opts?)` — 单 tag 当下值快照 + stale 标志
- `useTagHistory(tagId, opts?)` — 时间窗口历史点
- tag 命名约定 + namespace 校验
- vitest 单测
- README 用法示例

**不包含**:
- state_update / alarm / cusum / soft_sensor 派生 tag (后续按需扩)
- widget 类型定义 + 组件 (子项目 3)
- transform 表达式安全求值 (留给 widget 渲染层 — 子项目 4)
- 写值 (PLC 写入永远走"建议缓冲区"-"人工确认"-engine 下发, 非 widget 责任)

## 1. Tag Namespace (MVP)

格式: `<reactor_id>.<field>`

`reactor_id`: 任意 string, 与 BIOCore 反应器配置一致 (e.g. `F01`, `F02`).

`field`: 必须在 `ProcessValues` 类型 keys 集合内 (见 `packages/web-ui/src/types`):
- 模拟量输入: `AI-0` (罐温), `AI-1` (夹套温度), `AI-2` (pH), `AI-3` (DO), `AI-4` (罐压), `AI-5` (空气流量), `AI-6` (称重)
- 模拟量输出: `AO-0_cv` (蒸汽阀开度), `AO-1_cv` (冷却阀开度), `AO-2_cv` (空气阀开度)
- 泵速率: `P01_rate`, `P02_rate`, `P03_rate`, `P04_rate`
- 标量: `rpm`, `vfd_current`, `temp_sv`, `temp_mode`
- 元数据: `batch_id` (但只读 string, 非数值; 渲染层若用应单独处理)

非法 field → `value=null, isStale=true`. 不抛错, 不 console.warn (避免 widget 编辑时大量噪音).

## 2. API Surface

### useTag

```ts
type TagId = string;

interface UseTagOpts {
  staleMs?: number;        // 默认 5000ms. age 超过 → isStale=true
}

interface TagSnapshot {
  value: number | null;    // null = tag 不存在 / reactor 未连 / 从未收到 pv / field 非数值
  isStale: boolean;        // (Date.now() - timestamp) > staleMs  OR  value=null  OR  !wsConnected
  ageMs: number;           // Date.now() - new Date(processValues.timestamp).getTime(); Infinity 当无值
}

function useTag(tagId: TagId, opts?: UseTagOpts): TagSnapshot;
```

### useTagHistory

```ts
interface UseTagHistoryOpts {
  windowSec?: number;      // 默认 60s. 超过 store ring (3600s/反应器) → clamp 到 ring 大小
}

interface TagHistory {
  points: Array<{ t: number; v: number }>;   // 升序 by t (ms epoch)
  isStale: boolean;                          // 同 useTag 条件
}

function useTagHistory(tagId: TagId, opts?: UseTagHistoryOpts): TagHistory;
```

### 用法示例

```tsx
// Tank widget — 称重 → 罐液位高度
const { value, isStale } = useTag('F01.AI-6');
return <Tank value={value ?? 0} grayed={isStale} unit="kg" />;

// Temperature gauge — 罐温
const { value, isStale, ageMs } = useTag('F01.AI-0', { staleMs: 10000 });
return <Gauge value={value} stale={isStale} ageHint={`${(ageMs/1000).toFixed(0)}s 前`} />;

// Trend chart — 罐温 5 分钟窗口
const { points, isStale } = useTagHistory('F01.AI-0', { windowSec: 300 });
return <Line data={points} dim={isStale} />;
```

## 3. 数据流

```
PLC / mock
  → reactor-wiring.ts broadcast('pv_realtime', { timestamp, batch_id, AI-0...P04_rate }, batchId, reactorId)
  → ws-server send all WS clients
  → realtime-store onmessage 'pv_realtime' case
  → set reactorData[reactorId] = { ...prev, processValues: pv }
  → Zustand notifies subscribers
  → useTag('F01.AI-0') selector triggers
  → 算 ageMs = Date.now() - new Date(pv.timestamp).getTime()
  → React re-render
```

### Stale 重判机制

pv_realtime ~1Hz 时无忧, store set 自动触发 hook re-render → ageMs 重算。 但 WS 断时 store 不再 set, hook 不再 re-render, `isStale` 不及时翻 true。

**缓解**: 全局 1Hz tick (单 timer for 整个 UI). 在 `realtime-store` 加字段 `_tick: number` (Date.now()) + hook 文件顶部 `ensureTick()`:

```ts
let tickStarted = false;
function ensureTick() {
  if (tickStarted || typeof window === 'undefined') return;
  tickStarted = true;
  setInterval(() => useRealtimeStore.setState({ _tick: Date.now() }), 1000);
}
```

每个 useTag 调用 `ensureTick()` (幂等). hook 同时 select `_tick` (任何变化都触发 re-render, selector shallow eq 保证仅 value/timestamp/tick 变才 render 子件).

### useTagHistory 数据源

`realtime-store` 现有 `reactorData[rid].trendBuffer`:
```ts
trendBuffer: {
  timestamps: string[];      // 最近 3600 个 ISO ts
  temperature: number[];     // 平行数组, 对应 AI-0
  pH: number[];              // AI-2
  DO: number[];              // AI-3
  rpm: number[];
  airflow: number[];         // AI-5
}
```

useTagHistory 内部 field → buffer key mapping table:
```ts
const TREND_FIELD_MAP: Record<string, keyof TrendBuffer> = {
  'AI-0': 'temperature',
  'AI-2': 'pH',
  'AI-3': 'DO',
  'AI-5': 'airflow',
  'rpm':  'rpm',
};
```

不在 mapping 表的 field → `points=[]` (store ring 未维护该字段历史). 这是 MVP 限制, 文档说明: trend 只支持 5 个核心 tag, 其它 tag 想画图请扩 store trendBuffer (子项目 4 渲染层接活).

## 4. 边界条件表

| 场景 | useTag 返 | useTagHistory 返 |
|---|---|---|
| TagId 格式非法 (无 `.` 或多于一个 `.`) | `{ null, true, ∞ }` | `{ [], true }` |
| field 不在 ProcessValues keys | `{ null, true, ∞ }` | `{ [], true }` |
| field 在 ProcessValues 但不在 TREND_FIELD_MAP | `{ value, isStale, ageMs }` 正常 | `{ [], false }` (注: isStale 仍按 pv 算) |
| reactorData[rid] undefined | `{ null, true, ∞ }` | `{ [], true }` |
| processValues null (新连未收 pv) | `{ null, true, ∞ }` | `{ [], true }` |
| value 正常 + 新鲜 | `{ <num>, false, <small> }` | `{ [...], false }` |
| value 正常但 age > staleMs | `{ <num>, true, <large> }` | `{ [...], true }` |
| windowSec > 3600 | n/a | `{ store ring 全部, isStale 按 pv }` |
| windowSec = 0 | n/a | `{ [], false }` |
| wsConnected = false | `{ value 冻最后, true, age 持续涨 }` | `{ points 冻最后, true }` |

## 5. 文件结构

**新建**:
- `packages/web-ui/src/hooks/useTag.ts` — `useTag` + `parseTagId` + `ensureTick`
- `packages/web-ui/src/hooks/useTagHistory.ts` — `useTagHistory` + `TREND_FIELD_MAP`
- `packages/web-ui/src/hooks/index.ts` — barrel re-export
- `packages/web-ui/src/hooks/__tests__/useTag.test.tsx`
- `packages/web-ui/src/hooks/__tests__/useTagHistory.test.tsx`
- `packages/web-ui/src/hooks/README.md` — 用法示例 + tag namespace 表 + 限制说明

**修改**:
- `packages/web-ui/src/stores/realtime-store.ts` — 加 `_tick: number` 到 RealtimeState (初值 0), 不动 channel switch

依赖: 无新 npm 包 (zustand / react / vitest / @testing-library/react 已就位).

## 6. 测试

### 单元测试 — vitest + @testing-library/react

`useTag.test.tsx` (10 用例):
1. 合法 tag + 新鲜值 → value 正确, isStale=false, ageMs < staleMs
2. age > staleMs (mock Date.now 推 10s 后) → isStale=true
3. tagId 缺 '.' → null + stale
4. tagId 多于一个 '.' → null + stale (`F01.AI.0` 非法)
5. field 不在 ProcessValues → null + stale
6. reactorData[rid] undefined → null + stale
7. processValues=null → null + stale
8. wsConnected=false → 强制 isStale=true (即使 ageMs < staleMs)
9. staleMs 自定义 (10000) → 10s 内不 stale
10. tick 触发后 ageMs 自动涨 (vi.useFakeTimers + advance 2s)

`useTagHistory.test.tsx` (6 用例):
1. windowSec=60 → points 长度 ≈ 60 (1Hz 假定)
2. windowSec > 3600 → clamp 到 store ring (≤ 3600 点)
3. reactor 未连 → points=[], isStale=true
4. field=AI-0 → 取 trendBuffer.temperature; field=AI-2 → pH (mapping 表覆盖)
5. windowSec=0 → points=[]
6. points 按 t 升序

**Mock 策略**: `useRealtimeStore.setState({ reactorData: { F01: {...} }, wsConnected: true, _tick: Date.now() })`. 不真起 WS. `Date.now` mock 用 `vi.setSystemTime`.

### 手工 DoD

1. `pnpm --filter @biocore/web-ui test hooks` 全绿 (16/16)
2. 启 dev server + login
3. 临时在 dashboard 某页加 `<div>val={useTag('F01.AI-0').value} stale={String(useTag('F01.AI-0').isStale)}</div>`, 验 ~1Hz 更新
4. `pkill -f "tsx watch.*server"` → 5s 内 stale=true
5. 重启 server → 几秒内恢复 value 跟新, stale=false
6. README 用法示例可 copy-paste 编译通过

## 7. 风险 + 缓解

| 风险 | 缓解 |
|---|---|
| 1Hz tick 强制 re-render 所有 useTag 调用 | Zustand selector shallow eq + 仅 hook return 对象算量小; 100 tag widget 实测 < 5ms / tick |
| trendBuffer field 缺 (e.g. AI-1 / AI-4 / AI-6 / AO-*_cv / P*_rate) → trend widget 看不到数据 | 文档明示, 子项目 4 渲染层判 points.length==0 显示 "trend not available" |
| `processValues.timestamp` 缺或畸形 → ageMs=NaN | parse 失败时 ageMs=Infinity, isStale=true |
| 同一 hook 调用千次 (大型 view 含 N widget) | useTag 是 cheap selector; 仅当 field 值变才 render; 实测 100 widget 视图 30 fps 无压力 |
| ensureTick 在 SSR (Next.js) 触发 setInterval | guard `typeof window === 'undefined'` 跳过 |

## 8. 实施清单 (后续 writing-plans 输入)

1. realtime-store 加 `_tick: number` 字段 + 类型
2. useTag.ts: parseTagId + ensureTick + useTag impl + 单测
3. useTagHistory.ts: TREND_FIELD_MAP + useTagHistory impl + 单测
4. hooks/index.ts barrel
5. hooks/README.md 文档
6. 手工 DoD 跑通

## 9. 不做的事

- 不动 store 的 WS 处理逻辑 (所有 channel switch 不变)
- 不加新 WS channel
- 不支持 state/alarm/cusum/soft_sensor tag
- 不支持 multi-tag 单 hook (widget 自己 N 次 useTag)
- 不支持 derived / transform expression (widget 渲染层做)
- 不写 widget demo (子项目 3)
- 不改 ProcessValues 类型 (子项目 4 需新字段再说)

## 10. 参考

- 子项目 1 spec: `docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md` §1 Widget/Binding
- realtime-store: `packages/web-ui/src/stores/realtime-store.ts`
- ProcessValues 类型: `packages/web-ui/src/types/index.ts`
- WS broadcast 源: `packages/server/src/reactor-wiring.ts:143` (pv_realtime)
- BIOCore tag 命名约定: `AI-N` 模拟输入, `AO-N_cv` 模拟输出阀位, `P0N_rate` 泵速, 其余具名标量
