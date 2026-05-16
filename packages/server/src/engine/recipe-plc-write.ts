// engine/recipe-plc-write.ts — shared plcWrite logic used by batch-controller's
// recipe-step driven writes. Distinct from the SCADA dispatcher (which handles
// operator-accepted suggestions); recipes are pre-approved at promotion time.

import type { PlcWriter } from './plc-writer';

interface MappingShape {
  getVariables(): Array<{
    tag_name: string; plc_address: string; data_type: string;
    direction: string; connection_id: string;
  }>;
  getConnections(): Array<{ id: string; protocol: string }>;
}

export interface RecipePlcWriteDeps {
  mappingManager: MappingShape;
  writerFactory: (protocol: string) => PlcWriter;
}

export async function executeRecipePlcWrite(
  deps: RecipePlcWriteDeps,
  tag: string,
  value: number,
): Promise<void> {
  const mapping = deps.mappingManager.getVariables().find((v) => v.tag_name === tag);
  if (!mapping) throw new Error(`PLC 写失败: 标签 ${tag} 无 plc_variable_mappings 映射`);
  const dir = String(mapping.direction).toUpperCase();
  if (dir !== 'WRITE' && dir !== 'READWRITE') {
    throw new Error(`PLC 写失败: 标签 ${tag} direction=${mapping.direction} (仅可读)`);
  }
  const conn = deps.mappingManager.getConnections().find((c) => c.id === mapping.connection_id);
  if (!conn) throw new Error(`PLC 写失败: 连接 ${mapping.connection_id} 不存在`);
  const writer = deps.writerFactory(conn.protocol);
  await writer.write(conn as any, mapping as any, value);
}
