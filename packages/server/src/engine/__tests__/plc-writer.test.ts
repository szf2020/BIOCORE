import { describe, it, expect } from 'vitest';
import { MockPlcWriter } from '../plc-writer';

describe('MockPlcWriter', () => {
  it('writes value to in-mem store keyed by conn.id:plc_address', async () => {
    const w = new MockPlcWriter();
    const conn = { id: 'c1', protocol: 's7' } as any;
    const mapping = { plc_address: 'DB1.DBD0', data_type: 'real' } as any;
    await w.write(conn, mapping, 42.5);
    expect(w.read('c1', 'DB1.DBD0')).toBe(42.5);
  });
});
