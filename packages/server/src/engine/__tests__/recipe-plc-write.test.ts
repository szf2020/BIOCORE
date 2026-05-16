import { describe, it, expect } from 'vitest';
import { executeRecipePlcWrite } from '../recipe-plc-write';
import { MockPlcWriter } from '../plc-writer';

function setup(opts: { direction?: string; missingConn?: boolean } = {}) {
  const writer = new MockPlcWriter();
  const mapping = {
    tag_name: 'F01.SP-temp', plc_address: 'DB1.DBD0', data_type: 'real',
    direction: opts.direction ?? 'WRITE', connection_id: 'c1',
  };
  const mappingManager = {
    getVariables: () => [mapping],
    getConnections: () => opts.missingConn ? [] : [{ id: 'c1', protocol: 's7' }],
  };
  return {
    deps: { mappingManager, writerFactory: (_p: string) => writer },
    writer, mapping,
  };
}

describe('executeRecipePlcWrite', () => {
  it('writes to mock when WRITE direction + valid mapping', async () => {
    const { deps, writer } = setup();
    await executeRecipePlcWrite(deps, 'F01.SP-temp', 38);
    expect(writer.read('c1', 'DB1.DBD0')).toBe(38);
  });

  it('writes when direction=READWRITE (case-insensitive)', async () => {
    const { deps, writer } = setup({ direction: 'ReadWrite' });
    await executeRecipePlcWrite(deps, 'F01.SP-temp', 99);
    expect(writer.read('c1', 'DB1.DBD0')).toBe(99);
  });

  it('throws when tag has no mapping', async () => {
    const { deps } = setup();
    await expect(executeRecipePlcWrite(deps, 'UNKNOWN.TAG', 1)).rejects.toThrow(/无 plc_variable_mappings 映射/);
  });

  it('throws when direction=READ (read-only tag)', async () => {
    const { deps } = setup({ direction: 'READ' });
    await expect(executeRecipePlcWrite(deps, 'F01.SP-temp', 1)).rejects.toThrow(/仅可读/);
  });

  it('throws when connection_id not found', async () => {
    const { deps } = setup({ missingConn: true });
    await expect(executeRecipePlcWrite(deps, 'F01.SP-temp', 1)).rejects.toThrow(/连接.*不存在/);
  });
});
