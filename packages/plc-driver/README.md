# @biocore/plc-driver

BIOCore PLC 通讯驱动包. 支持 S7-200 SMART (snap7) 和 Modbus RTU/TCP (modbus-serial).

## 运行模式

### Mock 模式 (MOCK_PLC=true)

不需真实 PLC, 使用内存级 `MockPlcClient`. 适用于开发、测试、CI 环境.

```bash
MOCK_PLC=true
```

`createPlcDriver(config)` 工厂函数自动注入 `MockPlcClient`.

### Real 模式 (MOCK_PLC=false 或未设)

使用真实 snap7 连接 S7-200 SMART PLC.

```bash
MOCK_PLC=false
PLC_IP=192.168.1.10
PLC_RACK=0
PLC_SLOT=1
```

## 快速开始

```typescript
import { createPlcDriver } from '@biocore/plc-driver';

const mgr = createPlcDriver({
  id: 'plc-1',
  name: 'Main PLC',
  protocol: 's7',
  ip: process.env.PLC_IP || '192.168.1.10',
  port: 102,
  enabled: true,
  rack: Number(process.env.PLC_RACK ?? 0),
  slot: Number(process.env.PLC_SLOT ?? 1),
  heartbeat_write_address: 'VB400',
  heartbeat_read_address: 'VB401',
  heartbeat_timeout_ms: 3000,
  reconnect_interval_ms: 5000,
});

await mgr.connect();

// writeTag 必须传 confirmed=true (安全 gate, AI/自动化路径不可绕过)
await mgr.writeTag('pump_speed', 1500, { confirmed: true });

// readTag 失败时返回 null (不崩 server)
const temp = await mgr.readTag('temperature');
if (temp !== null) {
  console.log('温度:', temp);
}
```

## Reconnect 策略

连接断开后自动指数退避重连:

| 尝试 | 延迟 |
|------|------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 超限 | emit `max_reconnect_exceeded` |

```typescript
mgr.on('max_reconnect_exceeded', ({ id, attempts }) => {
  console.error(`PLC ${id} 重连失败 ${attempts} 次, 进入安全停留`);
});
```

## writeTag 安全 Gate

**所有写操作必须显式确认**:

```typescript
// WRONG: 缺少 confirmed → 抛出错误
await mgr.writeTag('valve', 1);

// CORRECT: 显式确认
await mgr.writeTag('valve', 1, { confirmed: true });
```

此约束防止 AI/animation/外部系统绕过人工审核直写 PLC.

## node-snap7 API 摘要

| 方法 | 用途 |
|------|------|
| `SetConnectionType(3)` | S7-200 SMART Basic 模式 |
| `ConnectTo(ip, rack, slot, cb)` | 建立连接 |
| `Disconnect()` | 断开连接 |
| `ReadArea(0x84, db, start, len, 0x02, cb)` | 读字节 |
| `WriteArea(0x84, db, start, len, 0x02, buf, cb)` | 写字节 |
