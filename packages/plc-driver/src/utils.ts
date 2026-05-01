// ============================================================
// plc-driver 纯函数工具 (无 native 依赖，可独立测试)
// ============================================================

import type { PLCVariableMapping } from './types';
import type { ParsedAddress } from './types';

// 解析 PLC 地址
// 支持两种格式:
//   V区:  VB100, VW100, VD100, V200.0
//   DB块: DB2.DBB10, DB2.DBW4, DB2.DBD100, DB2.DBX0.0
export function parseAddr(addr: string): ParsedAddress {
  // ── DB块格式 ──
  // DB2.DBX0.3 → db=2, byte=0, bit=3
  const dbBitMatch = addr.match(/^DB(\d+)\.DBX(\d+)\.(\d)$/i);
  if (dbBitMatch) {
    return {
      db: parseInt(dbBitMatch[1], 10),
      byte: parseInt(dbBitMatch[2], 10),
      bit: parseInt(dbBitMatch[3], 10),
    };
  }
  // DB2.DBW4, DB2.DBB10, DB2.DBD100
  const dbMatch = addr.match(/^DB(\d+)\.DB[BWD](\d+)$/i);
  if (dbMatch) {
    return {
      db: parseInt(dbMatch[1], 10),
      byte: parseInt(dbMatch[2], 10),
    };
  }

  // ── 短DB格式 (无DB号前缀) ──
  // DBX0.3 → byte=0, bit=3 (db由连接配置决定)
  const shortDbBit = addr.match(/^DBX(\d+)\.(\d)$/i);
  if (shortDbBit) {
    return { byte: parseInt(shortDbBit[1], 10), bit: parseInt(shortDbBit[2], 10) };
  }
  // DBW4, DBB10, DBD100
  const shortDb = addr.match(/^DB[BWD](\d+)$/i);
  if (shortDb) {
    return { byte: parseInt(shortDb[1], 10) };
  }

  // ── V区格式 ──
  // V200.3 → byte=200, bit=3
  const bitMatch = addr.match(/^V(\d+)\.(\d)$/i);
  if (bitMatch) {
    return { byte: parseInt(bitMatch[1], 10), bit: parseInt(bitMatch[2], 10) };
  }
  // VB100, VW100, VD100, V100
  const byteMatch = addr.match(/^V[BWDX]?(\d+)$/i);
  if (!byteMatch) throw new Error(`无效地址: ${addr} (支持 VW100, V200.0, DBW4, DB2.DBW4, DB2.DBX0.0)`);
  return { byte: parseInt(byteMatch[1], 10) };
}

// ─── 地址校验 (安全关键) ───────────────────────────────────
// S7-200 SMART G2 地址范围限制:
//   V区/DB区最大 10KB (ST30: VB0~VB9999)
//   DB号: 1~255
//   位号: 0~7
//   字(W)地址建议偶数对齐，双字(D)建议4对齐

const MAX_V_BYTE = 9999;   // ST30 V区上限
const MAX_DB_NUM = 255;

// 所有合法地址的严格正则 (大小写不敏感)
const VALID_PATTERNS = [
  // DB块完整格式: DB2.DBB10, DB2.DBW4, DB2.DBD100, DB2.DBX0.3
  /^DB(\d{1,3})\.DBB(\d{1,4})$/i,
  /^DB(\d{1,3})\.DBW(\d{1,4})$/i,
  /^DB(\d{1,3})\.DBD(\d{1,4})$/i,
  /^DB(\d{1,3})\.DBX(\d{1,4})\.([0-7])$/i,
  // DB短格式: DBB10, DBW4, DBD100, DBX0.3
  /^DBB(\d{1,4})$/i,
  /^DBW(\d{1,4})$/i,
  /^DBD(\d{1,4})$/i,
  /^DBX(\d{1,4})\.([0-7])$/i,
  // V区格式: VB100, VW100, VD100, V200.0
  /^VB(\d{1,4})$/i,
  /^VW(\d{1,4})$/i,
  /^VD(\d{1,4})$/i,
  /^V(\d{1,4})\.([0-7])$/i,
];

export interface AddressValidation {
  valid: boolean;
  error?: string;
}

// 校验 PLC 地址是否合法 (保存变量前必须调用)
export function validateAddr(addr: string, dataType?: string): AddressValidation {
  if (!addr || typeof addr !== 'string') {
    return { valid: false, error: '地址不能为空' };
  }

  const trimmed = addr.trim();

  // 检查是否匹配任一合法模式
  const matched = VALID_PATTERNS.some(p => p.test(trimmed));
  if (!matched) {
    return {
      valid: false,
      error: `不支持的地址格式: "${trimmed}" (合法格式: VW100, VB0, VD300, V200.0, DB2.DBW4, DB2.DBX0.3, DBW4)`,
    };
  }

  // 解析后检查范围
  try {
    const parsed = parseAddr(trimmed);

    // 字节偏移范围
    if (parsed.byte < 0 || parsed.byte > MAX_V_BYTE) {
      return { valid: false, error: `字节偏移 ${parsed.byte} 超出范围 (0~${MAX_V_BYTE})` };
    }

    // DB号范围
    if (parsed.db !== undefined && (parsed.db < 1 || parsed.db > MAX_DB_NUM)) {
      return { valid: false, error: `DB号 ${parsed.db} 超出范围 (1~${MAX_DB_NUM})` };
    }

    // 位号范围
    if (parsed.bit !== undefined && (parsed.bit < 0 || parsed.bit > 7)) {
      return { valid: false, error: `位号 ${parsed.bit} 超出范围 (0~7)` };
    }

    // 数据类型与地址后缀一致性检查
    if (dataType) {
      const addrUpper = trimmed.toUpperCase();
      // BOOL 类型必须用位地址 (V200.0, DBX0.3, DB2.DBX0.3)
      if (dataType === 'BOOL' && parsed.bit === undefined) {
        return { valid: false, error: 'BOOL类型必须使用位地址 (如 V200.0, DBX0.3, DB2.DBX0.3)' };
      }
      // 非BOOL类型不能用位地址
      if (dataType !== 'BOOL' && parsed.bit !== undefined) {
        return { valid: false, error: `${dataType}类型不能使用位地址` };
      }
      // INT16/UINT16 应使用 W(word) 地址
      if ((dataType === 'INT16' || dataType === 'UINT16') && /DB?B\d/i.test(addrUpper) && !addrUpper.includes('DBW') && !addrUpper.includes('VW')) {
        // 允许VB/DBB但发出提醒(不阻止)
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

// 数据类型对应的字节长度
export function byteLen(dt: string): number {
  return dt === 'BOOL' ? 1 : (dt === 'INT32' || dt === 'FLOAT32') ? 4 : 2;
}

// 从 Buffer 解码数值
export function decode(buf: Buffer, dt: string, bit?: number): number {
  const required = byteLen(dt);
  if (buf.length < required) {
    throw new Error(`decode buffer too short: need ${required} bytes for ${dt}, got ${buf.length}`);
  }
  switch (dt) {
    case 'BOOL':    return (buf.readUInt8(0) >> (bit ?? 0)) & 1;
    case 'INT16':   return buf.readInt16BE(0);
    case 'UINT16':  return buf.readUInt16BE(0);
    case 'INT32':   return buf.readInt32BE(0);
    case 'FLOAT32': return buf.readFloatBE(0);
    default:        return buf.readInt16BE(0);
  }
}

// 将数值编码为 Buffer
export function encode(val: number, dt: string): Buffer {
  const b = Buffer.alloc(byteLen(dt));
  switch (dt) {
    case 'BOOL':    b.writeUInt8(val ? 1 : 0, 0); break;
    case 'INT16':   b.writeInt16BE(val, 0); break;
    case 'UINT16':  b.writeUInt16BE(val, 0); break;
    case 'INT32':   b.writeInt32BE(val, 0); break;
    case 'FLOAT32': b.writeFloatBE(val, 0); break;
  }
  return b;
}

// 原始值 → 工程值 线性缩放
export function scale(raw: number, v: Pick<PLCVariableMapping, 'raw_min' | 'raw_max' | 'eng_min' | 'eng_max'>): number {
  if (v.raw_max === v.raw_min) return raw;
  return ((raw - v.raw_min) / (v.raw_max - v.raw_min)) * (v.eng_max - v.eng_min) + v.eng_min;
}

// 工程值 → 原始值 逆缩放 (clamped to raw range)
export function unscale(eng: number, v: Pick<PLCVariableMapping, 'raw_min' | 'raw_max' | 'eng_min' | 'eng_max'>): number {
  if (v.eng_max === v.eng_min) return eng;
  const result = ((eng - v.eng_min) / (v.eng_max - v.eng_min)) * (v.raw_max - v.raw_min) + v.raw_min;
  return Math.max(v.raw_min, Math.min(v.raw_max, result));
}

// 将变量按DB号+地址连续性分组，间隔>16字节则拆分 (优化批量读取)
export interface AddressGroup {
  db?: number;        // DB块号 (undefined = 使用连接默认)
  startByte: number;
  length: number;
  vars: PLCVariableMapping[];
}

export function groupByRegion(vars: PLCVariableMapping[]): AddressGroup[] {
  // 先按DB号分桶，再按地址排序合并
  const byDb = new Map<number | undefined, PLCVariableMapping[]>();
  for (const v of vars) {
    const parsed = parseAddr(v.plc_address);
    const dbKey = parsed.db;  // undefined 表示使用连接默认DB
    if (!byDb.has(dbKey)) byDb.set(dbKey, []);
    byDb.get(dbKey)!.push(v);
  }

  const groups: AddressGroup[] = [];

  for (const [db, dbVars] of byDb) {
    const sorted = [...dbVars].sort((a, b) => {
      return parseAddr(a.plc_address).byte - parseAddr(b.plc_address).byte;
    });

    let current: AddressGroup | null = null;

    for (const v of sorted) {
      const parsed = parseAddr(v.plc_address);
      const len = byteLen(v.data_type);
      const endByte = parsed.byte + len;

      if (!current || parsed.byte - (current.startByte + current.length) > 16) {
        current = { db, startByte: parsed.byte, length: len, vars: [v] };
        groups.push(current);
      } else {
        current.length = Math.max(current.length, endByte - current.startByte);
        current.vars.push(v);
      }
    }
  }
  return groups;
}
