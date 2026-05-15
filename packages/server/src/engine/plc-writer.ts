import type { PLCConnectionConfig, PLCVariableMapping } from '../../../plc-driver/src/types';
import { parseAddr } from '../../../plc-driver/src/utils';

export interface PlcWriter {
  write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void>;
}

export class MockPlcWriter implements PlcWriter {
  private mem = new Map<string, number>();

  async write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void> {
    const key = `${conn.id}:${mapping.plc_address}`;
    this.mem.set(key, value);
  }

  read(connId: string, addr: string): number | undefined {
    return this.mem.get(`${connId}:${addr}`);
  }
}

const mockSingleton = new MockPlcWriter();
export function getMockPlcWriter(): MockPlcWriter {
  return mockSingleton;
}

// ─── S7PlcWriter ────────────────────────────────────────────────────────────

const AREA_DB = 0x84;
const WORDLEN_BYTE = 0x02;

function encodeValue(value: number, dataType: string): Buffer {
  const dt = (dataType || '').toLowerCase();
  if (dt === 'real' || dt === 'float' || dt === 'float32') {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(value, 0);
    return buf;
  }
  if (dt === 'int' || dt === 'int16') {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(Math.round(value), 0);
    return buf;
  }
  if (dt === 'uint16') {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(Math.round(value), 0);
    return buf;
  }
  if (dt === 'dint' || dt === 'int32') {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(Math.round(value), 0);
    return buf;
  }
  if (dt === 'bool') {
    return Buffer.from([value ? 1 : 0]);
  }
  return Buffer.from([Math.round(value) & 0xff]);
}

function withTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`PLC write timeout ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

interface S7Client {
  Connected(): boolean;
  ConnectTo(ip: string, rack: number, slot: number, cb: (err: any) => void): void;
  WriteArea(area: number, db: number, start: number, amount: number, wl: number, buf: Buffer, cb: (err: any) => void): void;
}

export class S7PlcWriter implements PlcWriter {
  private clients = new Map<string, S7Client>();
  private factory: () => S7Client;

  constructor(factory?: () => S7Client) {
    if (factory) {
      this.factory = factory;
    } else {
      this.factory = () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const snap7 = require('node-snap7');
        return new snap7.S7Client();
      };
    }
  }

  private async getClient(conn: PLCConnectionConfig): Promise<S7Client> {
    let c = this.clients.get(conn.id);
    if (c && c.Connected()) return c;
    c = this.factory();
    this.clients.set(conn.id, c);
    await new Promise<void>((resolve, reject) => {
      c!.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) => {
        if (err) reject(new Error(`S7 ConnectTo ${err}`));
        else resolve();
      });
    });
    return c;
  }

  async write(conn: PLCConnectionConfig, mapping: PLCVariableMapping, value: number): Promise<void> {
    const client = await this.getClient(conn);
    const parsed = parseAddr(mapping.plc_address);
    const buf = encodeValue(value, mapping.data_type);
    await withTimeout(5000, new Promise<void>((resolve, reject) => {
      client.WriteArea(
        AREA_DB,
        parsed.db ?? conn.s7_db ?? 1,
        parsed.byte ?? 0,
        buf.length,
        WORDLEN_BYTE,
        buf,
        (err: any) => err ? reject(new Error(`S7 WriteArea ${err}`)) : resolve()
      );
    }));
  }
}
