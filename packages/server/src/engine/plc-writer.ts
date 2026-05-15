import type { PLCConnectionConfig, PLCVariableMapping } from '../../../plc-driver/src/types';

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
