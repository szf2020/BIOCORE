// ============================================================
// SP-FX-23: snap7 real 模式单元测试
// mock node-snap7 + modbus-serial (不需真 PLC)
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── mock node-snap7 ──────────────────────────────────────────
vi.mock('node-snap7', () => {
  class S7Client {
    private _connected = false;

    SetConnectionType(_type: number): void {}

    ConnectTo(_ip: string, _rack: number, _slot: number, cb: (err: any) => void): void {
      this._connected = true;
      setImmediate(() => cb(null));
    }

    Disconnect(): void {
      this._connected = false;
    }

    Connected(): boolean {
      return this._connected;
    }

    ReadArea(
      _area: number,
      _db: number,
      _start: number,
      amount: number,
      _wordLen: number,
      cb: (err: any, data: Buffer) => void
    ): void {
      setImmediate(() => cb(null, Buffer.alloc(amount, 0)));
    }

    WriteArea(
      _area: number,
      _db: number,
      _start: number,
      _amount: number,
      _wordLen: number,
      _buffer: Buffer,
      cb: (err: any) => void
    ): void {
      setImmediate(() => cb(null));
    }
  }
  return { S7Client, default: { S7Client } };
});

// ── mock modbus-serial ───────────────────────────────────────
vi.mock('modbus-serial', () => {
  class ModbusRTU {
    setID(_id: number): void {}
    setTimeout(_ms: number): void {}
    connectTCP(_ip: string, _opts: any): Promise<void> { return Promise.reject(new Error('mock')); }
    connectRTUBuffered(_p: string, _o: any): Promise<void> { return Promise.reject(new Error('mock')); }
    close(cb: () => void): void { cb(); }
    readHoldingRegisters(_s: number, _c: number): Promise<any> {
      return Promise.resolve({ data: [], buffer: Buffer.alloc(0) });
    }
    writeRegisters(_s: number, _r: number[]): Promise<any> { return Promise.resolve(); }
    writeRegister(_s: number, _v: number): Promise<any> { return Promise.resolve(); }
  }
  return { default: ModbusRTU };
});

import { MockPlcClient, createPlcDriver, PLCConnectionManager } from '../index';
import type { PLCConnectionConfig, PLCVariableMapping } from '../types';

// ── 共用 config ──────────────────────────────────────────────
const baseCfg: PLCConnectionConfig = {
  id: 'test-plc',
  name: 'Test PLC',
  protocol: 's7',
  ip: '192.168.1.10',
  port: 102,
  enabled: true,
  rack: 0,
  slot: 1,
  heartbeat_write_address: 'VB400',
  heartbeat_read_address: 'VB401',
  heartbeat_timeout_ms: 3000,
  reconnect_interval_ms: 50,
};

// ── Test 1: MockPlcClient 读未初始化区返回零 Buffer ───────────

describe('MockPlcClient', () => {
  it('Test 1: 读未初始化区返回零 Buffer', async () => {
    const mock = new MockPlcClient();
    const buf = await mock.readBytes(100, 4);
    expect(buf).toHaveLength(4);
    expect(buf.every(b => b === 0)).toBe(true);
  });

  // ── Test 2: MockPlcClient write+read roundtrip ─────────────

  it('Test 2: write + read roundtrip 数据完整', async () => {
    const mock = new MockPlcClient();
    const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    await mock.writeBytes(200, data);
    const result = await mock.readBytes(200, 4);
    expect(result).toEqual(data);
  });

  it('isConnected 永远返回 true', () => {
    const mock = new MockPlcClient();
    expect(mock.isConnected()).toBe(true);
  });

  it('connect/disconnect 为 noop', async () => {
    const mock = new MockPlcClient();
    await expect(mock.connect()).resolves.toBeUndefined();
    await expect(mock.disconnect()).resolves.toBeUndefined();
    expect(mock.isConnected()).toBe(true);
  });
});

// ── Test 3: createPlcDriver MOCK_PLC=true → MockPlcClient ────

describe('createPlcDriver factory', () => {
  afterEach(() => {
    delete process.env.MOCK_PLC;
  });

  it('Test 3: MOCK_PLC=true → connect 立即成功 (MockPlcClient noop)', async () => {
    process.env.MOCK_PLC = 'true';
    const mgr = createPlcDriver(baseCfg);
    await expect(mgr.connect()).resolves.toBeUndefined();
    await mgr.disconnect();
  });

  it('MOCK_PLC 未设 → 返回 PLCConnectionManager 实例', () => {
    delete process.env.MOCK_PLC;
    const mgr = createPlcDriver(baseCfg);
    expect(mgr).toBeInstanceOf(PLCConnectionManager);
  });
});

// ── Test 4+5: writeTag confirmed gate ────────────────────────

describe('writeTag confirmed gate', () => {
  let mgr: PLCConnectionManager;
  const writableVar: PLCVariableMapping = {
    id: 'v1', tag_name: 'pump_speed', description: 'Pump Speed',
    plc_address: 'VW100', data_type: 'INT16', direction: 'READWRITE',
    scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 0,
    eng_unit: '', group: '', poll_rate_ms: 1000, enabled: true, connection_id: 'test-plc',
  };

  beforeEach(async () => {
    process.env.MOCK_PLC = 'true';
    mgr = createPlcDriver(baseCfg);
    await mgr.connect();
    mgr.setVariables([writableVar]);
  });

  afterEach(async () => {
    await mgr.disconnect();
    delete process.env.MOCK_PLC;
  });

  it('Test 4: writeTag 缺少 confirmed → 抛出 confirmed 错误', async () => {
    await expect(
      mgr.writeTag('pump_speed', 100)
    ).rejects.toThrow(/confirmed/i);
  });

  it('Test 4b: writeTag confirmed=false → 抛出 confirmed 错误', async () => {
    await expect(
      mgr.writeTag('pump_speed', 100, { confirmed: false })
    ).rejects.toThrow(/confirmed/i);
  });

  it('Test 5: writeTag confirmed=true → 正常执行不抛出', async () => {
    await expect(
      mgr.writeTag('pump_speed', 100, { confirmed: true })
    ).resolves.toBeUndefined();
  });
});

// ── Test 6: reconnect backoff max 5 次 ────────────────────────

describe('reconnect backoff', () => {
  it('Test 6: 5 次尝试失败 → emit max_reconnect_exceeded', async () => {
    vi.useFakeTimers();

    const failAdapter = {
      connect: vi.fn().mockRejectedValue(new Error('connect fail')),
      disconnect: vi.fn().mockResolvedValue(undefined),
      readBytes: vi.fn().mockRejectedValue(new Error('read fail')),
      writeBytes: vi.fn().mockRejectedValue(new Error('write fail')),
      isConnected: vi.fn().mockReturnValue(false),
    };

    const mgr2 = new PLCConnectionManager(
      { ...baseCfg, reconnect_interval_ms: 0 },
      failAdapter as any
    );

    const events: Array<{ type: string; attempts?: number }> = [];
    mgr2.on('max_reconnect_exceeded', (data: any) =>
      events.push({ type: 'exceeded', attempts: data.attempts })
    );

    (mgr2 as any).tryReconnect();

    await vi.runAllTimersAsync();

    const exceeded = events.find(e => e.type === 'exceeded');
    expect(exceeded).toBeDefined();
    expect(exceeded?.attempts).toBe(5);

    vi.useRealTimers();
  }, 10_000);
});

// ── Test 7: readTag error → null + reconnect ─────────────────

describe('readTag error handling', () => {
  it('Test 7: readTag 失败 → 返回 null, 触发 reconnect 事件', async () => {
    const failAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      readBytes: vi.fn().mockRejectedValue(new Error('read timeout')),
      writeBytes: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
    };

    const mgr = new PLCConnectionManager(baseCfg, failAdapter as any);
    const readableVar: PLCVariableMapping = {
      id: 'v2', tag_name: 'temperature', description: 'Temp',
      plc_address: 'VW200', data_type: 'INT16', direction: 'READ',
      scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 0,
      eng_unit: '', group: '', poll_rate_ms: 1000, enabled: true, connection_id: 'test-plc',
    };
    mgr.setVariables([readableVar]);

    const reconnectEvents: string[] = [];
    mgr.on('reconnecting', () => reconnectEvents.push('reconnecting'));

    const result = await mgr.readTag('temperature');
    expect(result).toBeNull();

    await new Promise(r => setTimeout(r, 20));
    expect(reconnectEvents).toContain('reconnecting');
  });
});
