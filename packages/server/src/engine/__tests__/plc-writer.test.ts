import { describe, it, expect } from 'vitest';
import { MockPlcWriter } from '../plc-writer';
import { S7PlcWriter } from '../plc-writer';

describe('MockPlcWriter', () => {
  it('writes value to in-mem store keyed by conn.id:plc_address', async () => {
    const w = new MockPlcWriter();
    const conn = { id: 'c1', protocol: 's7' } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real' } as any;
    await w.write(conn, mapping, 42.5);
    expect(w.read('c1', 'DB1.DBD0')).toBe(42.5);
  });
});

describe('S7PlcWriter', () => {
  it('calls WriteArea and resolves on success', async () => {
    let captured: any = {};
    const fakeClient = {
      Connected: () => true,
      ConnectTo: (_ip: string, _r: number, _s: number, cb: (e: any) => void) => cb(null),
      WriteArea: (area: number, db: number, start: number, amt: number, wl: number, buf: Buffer, cb: (err: any) => void) => {
        captured = { area, db, start, amt, wl, buf };
        cb(null);
      },
    };
    const w = new S7PlcWriter(() => fakeClient as any);
    const conn = { id: 'c1', protocol: 's7', ip: '127.0.0.1', rack: 0, slot: 1, s7_db: 1 } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real', scaling_enabled: 0 } as any;
    await w.write(conn, mapping, 42.5);
    expect(captured.amt).toBeGreaterThan(0);
  });

  it('rejects with Error when WriteArea callback receives err', async () => {
    const fakeClient = {
      Connected: () => true,
      ConnectTo: (_ip: string, _r: number, _s: number, cb: (e: any) => void) => cb(null),
      WriteArea: (_a: number, _d: number, _s: number, _am: number, _w: number, _b: Buffer, cb: (err: any) => void) => cb(5),
    };
    const w = new S7PlcWriter(() => fakeClient as any);
    const conn = { id: 'c1', protocol: 's7', ip: '127.0.0.1', rack: 0, slot: 1, s7_db: 1 } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real', scaling_enabled: 0 } as any;
    await expect(w.write(conn, mapping, 42.5)).rejects.toThrow(/S7 WriteArea/);
  });
});
