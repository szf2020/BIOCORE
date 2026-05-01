/**
 * Regression guard for risk #1 (Sprint 4 Track A hardening).
 *
 * Hypothesis from spec (2026-05-01): PLCConnectionManager.disconnect() may
 * leak heartbeat or reconnect timers across many connect/disconnect cycles.
 *
 * Investigation (T3, 2026-05-01): existing disconnect() correctly clears
 * both hbTimer (via stopHeartbeat()) and reconnectTimerHandle. This test
 * confirms the current behavior and prevents regression if anyone later
 * removes those clearInterval/clearTimeout calls.
 *
 * Note: a separate potential race in tryReconnect.loop (where a reconnect
 * setTimeout could be scheduled after disconnect() ran) is NOT covered here
 * and remains an open question for later investigation.
 */

// ============================================================
// Risk #1 — PLC reconnect handle leak (TDD red step)
//
// Hypothesis: connect()/disconnect() cycles against a failing PLC
// leave orphaned timers/sockets in process._getActiveHandles().
// After 100 cycles the handle count must not grow by more than 2
// (allowing slack for unrelated harness handles).
//
// NOTE: The task spec referred to `Snap7Adapter`, but the heartbeat
// + reconnect timers live in the public `PLCConnectionManager` class
// (Snap7Adapter is not exported). The test exercises the real
// public API so the leak shows up where production code runs.
//
// `node-snap7` is mocked so the test runs without the native
// binding. The mock simulates a connect failure (errCode=1) on
// every attempt and starts a setInterval timer per S7Client
// instance to mimic the native socket-keepalive handle. If
// disconnect() does not tear that timer down we'll see the active
// handle count grow linearly.
// ============================================================

import { describe, it, expect, beforeAll, vi } from 'vitest';

// ── Mock node-snap7 so we don't need the native .node binding ──
vi.mock('node-snap7', () => {
  class S7Client {
    private keepalive: ReturnType<typeof setInterval> | null = null;
    private connected = false;

    SetConnectionType(_type: number): void {
      // Simulate the native module allocating a long-lived handle
      // when a session is set up.  This is what leaks if the
      // owning class forgets to clean up on disconnect().
      if (!this.keepalive) {
        this.keepalive = setInterval(() => {
          /* noop — represents a native socket keepalive */
        }, 10_000);
      }
    }

    ConnectTo(_ip: string, _rack: number, _slot: number, cb: (err: any) => void): void {
      // Succeed so PLCConnectionManager.connect() runs through
      // startHeartbeat() — that's where the heartbeat timer is
      // allocated. The leak hypothesis says disconnect() forgets
      // to clear that interval, leaving an orphaned timer per
      // cycle.
      this.connected = true;
      setImmediate(() => cb(null));
    }

    Disconnect(): void {
      this.connected = false;
      if (this.keepalive) {
        clearInterval(this.keepalive);
        this.keepalive = null;
      }
    }

    Connected(): boolean {
      return this.connected;
    }

    ReadArea(_area: number, _db: number, _start: number, _amount: number, _wl: number, cb: (err: any, buf: Buffer) => void): void {
      setImmediate(() => cb(1, Buffer.alloc(0)));
    }

    WriteArea(_area: number, _db: number, _start: number, _amount: number, _wl: number, _buf: Buffer, cb: (err: any) => void): void {
      setImmediate(() => cb(1));
    }
  }
  return { S7Client, default: { S7Client } };
});

// ── Mock modbus-serial too — index.ts imports it at top-level ──
vi.mock('modbus-serial', () => {
  class ModbusRTU {
    setID(_id: number): void {}
    setTimeout(_ms: number): void {}
    connectTCP(_ip: string, _opts: any): Promise<void> { return Promise.reject(new Error('mock')); }
    connectRTUBuffered(_p: string, _o: any): Promise<void> { return Promise.reject(new Error('mock')); }
    close(cb: () => void): void { cb(); }
    readHoldingRegisters(_s: number, _c: number): Promise<any> { return Promise.resolve({ data: [], buffer: Buffer.alloc(0) }); }
    writeRegisters(_s: number, _r: number[]): Promise<any> { return Promise.resolve(); }
    writeRegister(_s: number, _v: number): Promise<any> { return Promise.resolve(); }
  }
  return { default: ModbusRTU };
});

import { PLCConnectionManager } from '../index';
import type { PLCConnectionConfig } from '../types';

describe('PLCConnectionManager reconnect cleanup (risk #1 regression guard)', () => {
  let baselineHandles: number;

  beforeAll(() => {
    baselineHandles = (process as any)._getActiveHandles().length;
  });

  it('regression: 100 connect/disconnect cycles do not leak active handles or timers', async () => {
    const cfg: PLCConnectionConfig = {
      id: 'leak-test',
      name: 'leak-test',
      protocol: 's7',
      ip: '127.0.0.1',
      port: 102,
      enabled: true,
      rack: 0,
      slot: 1,
      heartbeat_write_address: 'VB400',
      heartbeat_read_address: 'VB401',
      heartbeat_timeout_ms: 3000,
      reconnect_interval_ms: 5000,
    };

    for (let i = 0; i < 100; i++) {
      const mgr = new PLCConnectionManager(cfg);
      try {
        await mgr.connect();
      } catch {
        // expected — mocked S7Client always rejects
      }
      await mgr.disconnect();
    }

    const after = (process as any)._getActiveHandles().length;
    expect(after - baselineHandles).toBeLessThanOrEqual(2);
  }, 60_000);
});
