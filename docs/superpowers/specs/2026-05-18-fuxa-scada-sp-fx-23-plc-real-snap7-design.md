# SP-FX-23 设计文档: PLC 真实接入 (snap7-real)

**日期**: 2026-05-18  
**Sprint**: SP-FX-23  
**范围**: `packages/plc-driver/*` only  
**状态**: APPROVED

---

## 1. 现状分析

### 1.1 现有架构

`packages/plc-driver/src/index.ts` 已实现完整的双协议驱动:

- `Snap7Adapter` — 实现 `IProtocolAdapter`, 封装 `node-snap7` S7Client
- `ModbusAdapter` — 实现 `IProtocolAdapter`, 封装 `modbus-serial`
- `PLCConnectionManager` — 统一连接管理 + 双向心跳 + reconnect
- `PollingScheduler` — 按 poll_rate_ms 分组轮询

`MOCK_PLC` env 已存在于 `.env.example`, 但 `index.ts` **没有工厂分支**:
- 无论 `MOCK_PLC` 是 true 还是 false, 永远使用 `Snap7Adapter` (真实 PLC)
- 没有 MockPlcClient 类
- `writeTag` 没有 `opts.confirmed===true` gate

### 1.2 node-snap7 API Surface (已验证)

```typescript
// node-snap7.d.ts 已声明:
class S7Client {
  SetConnectionType(type: number): void;
  ConnectTo(ip: string, rack: number, slot: number, cb: (err: any) => void): void;
  Disconnect(): void;
  Connected(): boolean;
  ReadArea(area: number, dbNumber: number, start: number, amount: number, wordLen: number, cb: (err: any, data: Buffer) => void): void;
  WriteArea(area: number, dbNumber: number, start: number, amount: number, wordLen: number, buffer: Buffer, cb: (err: any) => void): void;
}
```

实际 S7-200 SMART 参数:
- `ConnectionType = 3` (Basic, 非 PG/OP)
- `Area = 0x84` (S7AreaDB, V区映射)
- `WordLen = 0x02` (S7WLByte)

### 1.3 writeTag 现状

现 `writeTag` 在 `PLCConnectionManager` 中直接执行写操作, **没有 confirmed gate**. SP-FX-23 需补加此门控.

---

## 2. 设计目标

1. 补充 `MockPlcClient` — 内存级 mock, 不调任何 native lib
2. 工厂函数 `createPlcDriver` — `MOCK_PLC=true` → Mock, `MOCK_PLC=false/未设` → Snap7 (现 Snap7Adapter)
3. `writeTag` confirmed gate — `opts.confirmed !== true` → 抛出, 不调 snap7
4. Reconnect backoff — max 5 次, 指数退避 (1s, 2s, 4s, 8s, 16s), 超限 emit `max_reconnect_exceeded`
5. Read error → log + return null + 触发 reconnect (不崩 server)
6. 7 新 tests (mock node-snap7 + mock modbus-serial via vitest)

---

## 3. 组件设计

### 3.1 MockPlcClient

内存 Buffer store, 键为 `${db ?? 0}:${start}`:

```
MockPlcClient implements IProtocolAdapter
  store: Map<string, Buffer>
  
  readBytes(start, length, db?): Promise<Buffer>
    → 返回 store 命中 slice; 未命中返回 zeros(length)
  
  writeBytes(start, buffer, db?): Promise<void>
    → 写入 store[key] = buffer (immutable copy)
  
  connect(): Promise<void>   → noop resolve
  disconnect(): Promise<void> → noop resolve
  isConnected(): boolean      → true
```

### 3.2 工厂函数

```typescript
// 新增导出
export function createPlcDriver(config: PLCConnectionConfig): PLCConnectionManager

// PLCConnectionManager constructor 扩展:
constructor(config: PLCConnectionConfig, adapter?: IProtocolAdapter)
  // adapter 有传入 → 直接用
  // 无传入 → 按 config.protocol 建 Snap7Adapter/ModbusAdapter (现有逻辑不变)
```

### 3.3 writeTag confirmed gate

```typescript
async writeTag(
  tag: string,
  value: number,
  opts?: { confirmed?: boolean }
): Promise<void>

// 前置检查:
if (opts?.confirmed !== true) {
  throw new Error(`writeTag "${tag}" 需要显式确认: 传入 opts.confirmed=true`);
}
// 后续: 现有写逻辑不变
```

### 3.4 Reconnect Backoff (指数, max 5 次)

```
tryReconnect():
  attempt 0 → delay 1s
  attempt 1 → delay 2s
  attempt 2 → delay 4s
  attempt 3 → delay 8s
  attempt 4 → delay 16s
  attempt 5 → emit('max_reconnect_exceeded') + stop
```

连接成功 → emit `reconnected` + reset attempt=0.

### 3.5 Read error handling

```
readTag(tag) → Promise<number | null>
  catch → console.error + tryReconnect() + return null

readAll() / readSnapshot()
  per-variable catch → quality='bad' (现行为, 保留)
  group-level catch → per-var quality='bad' + tryReconnect()
```

---

## 4. Connection Lifecycle 图

```
DISCONNECTED
    │ connect()
    ▼
CONNECTED ──── heartbeat OK ────► CONNECTED
    │
    │ heartbeat error / read error
    ▼
RECONNECTING (attempt 1-5, exponential backoff)
    │ success             │ attempt 6
    ▼                     ▼
CONNECTED           max_reconnect_exceeded event
                         (server handles: alert + safe hold)
```

---

## 5. 测试计划 (7 新 tests)

文件: `src/__tests__/snap7-real.test.ts`

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | MockPlcClient 读未初始化区返回零 | zeros buffer |
| 2 | MockPlcClient write+read roundtrip | 数据完整性 |
| 3 | createPlcDriver MOCK_PLC=true 注入 Mock | 工厂分支 |
| 4 | writeTag 缺少 confirmed → throws | gate 拦截 |
| 5 | writeTag confirmed=true → 正常执行 | gate 放行 |
| 6 | reconnect backoff max 5 次 → max_reconnect_exceeded | backoff 上限 |
| 7 | readTag error → 返回 null + 触发 reconnect | 不崩保护 |

---

## 6. .env.example 补充项

`MOCK_PLC=true` 已存在. 增加注释说明 + 确认 `PLC_IP`/`PLC_RACK`/`PLC_SLOT` 在文件中存在 (已验证存在).

---

## 7. 约束确认

| 约束 | 状态 |
|------|------|
| writeTag opts.confirmed===true gate | 新增, 严格保留 |
| AI/animation 路径不动 | 确认, 不涉及 |
| HMI/WriteIntentDialog 不动 | 确认, 不涉及 |
| server/web-ui 不动 | 确认, 仅 plc-driver |
| ZERO 新第三方 dep | node-snap7 已存在于 dep |
| 基线 tests 65 不减 | 新增 7 → 目标 72 |
