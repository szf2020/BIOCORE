// ============================================================
// doe-uniform.ts — 均匀设计表
//
// 参考《试验设计与数据处理》第9章:
//   均匀设计使用均匀表安排试验, 只考虑试验点的均匀散布,
//   水平数较多时可大大减少试验次数.
//   通常配合回归分析使用.
//
// 内置均匀表: U5, U7, U8, U9, U11, U12, U13
// 适用于 PID 参数调优等连续因素的多水平优化
// ============================================================

import type {
  DOEFactor,
  UniformTableMeta,
  UniformDesign,
  OrthogonalRun,
} from './doe-types';

// ─── 内置均匀表 (Good Lattice Point 法生成) ───────────────

/**
 * U5(5²): 5次试验, 5水平, 最多2因素
 * 生成元向量 h = (1, 2)
 */
const U5: UniformTableMeta = {
  name: 'U5(5²)',
  runs: 5,
  levelCount: 5,
  maxFactors: 2,
  matrix: [
    [1, 2],
    [2, 4],
    [3, 1],
    [4, 3],
    [5, 5],
  ],
};

/**
 * U7(7³): 7次试验, 7水平, 最多3因素
 * 生成元向量 h = (1, 2, 3)
 */
const U7: UniformTableMeta = {
  name: 'U7(7³)',
  runs: 7,
  levelCount: 7,
  maxFactors: 3,
  matrix: [
    [1, 2, 3],
    [2, 4, 6],
    [3, 6, 2],
    [4, 1, 5],
    [5, 3, 1],
    [6, 5, 4],
    [7, 7, 7],
  ],
};

/**
 * U8(8⁴): 8次试验, 8水平, 最多4因素
 * 生成元向量 h = (1, 3, 5, 7)
 */
const U8: UniformTableMeta = {
  name: 'U8(8⁴)',
  runs: 8,
  levelCount: 8,
  maxFactors: 4,
  matrix: generateUniformTable(8, [1, 3, 5, 7]),
};

/**
 * U9(9⁴): 9次试验, 9水平, 最多4因素
 * 生成元向量 h = (1, 2, 4, 7)
 */
const U9: UniformTableMeta = {
  name: 'U9(9⁴)',
  runs: 9,
  levelCount: 9,
  maxFactors: 4,
  matrix: generateUniformTable(9, [1, 2, 4, 7]),
};

/**
 * U11(11⁵): 11次试验, 11水平, 最多5因素
 * 生成元向量 h = (1, 2, 3, 4, 5)
 */
const U11: UniformTableMeta = {
  name: 'U11(11⁵)',
  runs: 11,
  levelCount: 11,
  maxFactors: 5,
  matrix: generateUniformTable(11, [1, 2, 3, 4, 5]),
};

/**
 * U12(12⁴): 12次试验, 12水平, 最多4因素
 * 生成元向量 h = (1, 5, 7, 11)
 */
const U12: UniformTableMeta = {
  name: 'U12(12⁴)',
  runs: 12,
  levelCount: 12,
  maxFactors: 4,
  matrix: generateUniformTable(12, [1, 5, 7, 11]),
};

/**
 * U13(13⁶): 13次试验, 13水平, 最多6因素
 * 生成元向量 h = (1, 2, 3, 4, 5, 6)
 */
const U13: UniformTableMeta = {
  name: 'U13(13⁶)',
  runs: 13,
  levelCount: 13,
  maxFactors: 6,
  matrix: generateUniformTable(13, [1, 2, 3, 4, 5, 6]),
};

/**
 * Good Lattice Point (GLP) 法生成均匀表
 *
 * 对于 n 次试验, s 个因素, 生成元 h = (h1, h2, ..., hs):
 * 第 i 行第 j 列 = (i * hj) mod n, 若为0则取n
 *
 * @param n - 试验次数 (建议为素数)
 * @param generators - 生成元向量
 */
function generateUniformTable(n: number, generators: number[]): number[][] {
  const matrix: number[][] = [];
  for (let i = 1; i <= n; i++) {
    const row = generators.map(h => {
      const val = (i * h) % n;
      return val === 0 ? n : val;
    });
    matrix.push(row);
  }
  return matrix;
}

// ─── 均匀表注册表 ─────────────────────────────────────────

const UNIFORM_TABLES: UniformTableMeta[] = [U5, U7, U8, U9, U11, U12, U13];

/** 获取所有可用均匀表 */
export function listUniformTables(): UniformTableMeta[] {
  return UNIFORM_TABLES.map(t => ({ ...t, matrix: [] }));
}

/** 按名称获取均匀表 */
export function getUniformTable(name: string): UniformTableMeta | null {
  return UNIFORM_TABLES.find(t => t.name === name) ?? null;
}

/** 自动选择合适的均匀表 */
export function selectUniformTable(
  factorCount: number,
  minRuns?: number,
): UniformTableMeta | null {
  const candidates = UNIFORM_TABLES
    .filter(t => t.maxFactors >= factorCount)
    .filter(t => !minRuns || t.runs >= minRuns)
    .sort((a, b) => a.runs - b.runs);
  return candidates[0] ?? null;
}

// ─── 均匀设计生成 ──────────────────────────────────────────

/**
 * 生成均匀试验设计方案
 *
 * 均匀表中的水平编号映射到因素的实际值:
 *   实际值 = min + (编号 - 0.5) / n × (max - min)
 * 其中 n 为水平数 (= 试验次数)
 *
 * @param factors - 因素定义 (levels 字段会被忽略, 用 min/max 连续映射)
 * @param tableName - 指定均匀表 (可选)
 */
export function generateUniformDesign(
  factors: { name: string; min: number; max: number; unit?: string }[],
  tableName?: string,
): UniformDesign {
  if (factors.length === 0) {
    throw new Error('至少需要1个因素');
  }

  // 获取或自动选择均匀表
  let table: UniformTableMeta | null = null;
  if (tableName) {
    table = getUniformTable(tableName);
    if (!table) throw new Error(`未找到均匀表: ${tableName}`);
  } else {
    table = selectUniformTable(factors.length);
    if (!table) {
      throw new Error(`没有合适的均匀表: ${factors.length}个因素`);
    }
  }

  if (factors.length > table.maxFactors) {
    throw new Error(
      `因素数(${factors.length})超过均匀表${table.name}的最大列数(${table.maxFactors})`
    );
  }

  // 分配因素到列
  const columnAssignment: Record<string, number> = {};
  factors.forEach((f, i) => {
    columnAssignment[f.name] = i;
  });

  // 生成试验方案
  const n = table.runs;
  const runs: OrthogonalRun[] = table.matrix.map((row, i) => {
    const factorValues: Record<string, number> = {};
    const factorLevels: Record<string, number> = {};

    factors.forEach((f, j) => {
      const levelNum = row[j]; // 1-based 水平编号
      // 映射到实际值: 区间中点法
      const value = f.min + (levelNum - 0.5) / n * (f.max - f.min);
      factorValues[f.name] = round(value, 4);
      factorLevels[f.name] = levelNum;
    });

    return {
      runIndex: i + 1,
      factorValues,
      factorLevels,
    };
  });

  return {
    table,
    columnAssignment,
    runs,
  };
}

/**
 * 自定义 GLP 均匀表生成
 *
 * 当内置表不满足需求时, 用 Good Lattice Point 法
 * 根据指定的试验次数和因素数生成均匀表.
 *
 * @param n - 试验次数 (最好为素数)
 * @param factorCount - 因素数
 */
export function generateCustomUniformTable(
  n: number,
  factorCount: number,
): UniformTableMeta {
  // 选择生成元: 使用 power generator h_j = g^(j-1) mod n
  // g 选择使得偏差最小 (简化版: 用 2 作为基底)
  const generators: number[] = [];
  let g = 1;
  for (let j = 0; j < factorCount; j++) {
    generators.push(g);
    g = (g * 2) % n || 1;
    // 避免重复
    if (generators.includes(g) && j < factorCount - 1) {
      g = (g + 1) % n || 1;
    }
  }

  return {
    name: `U${n}(${n}^${factorCount})`,
    runs: n,
    levelCount: n,
    maxFactors: factorCount,
    matrix: generateUniformTable(n, generators),
  };
}

// ─── 工具函数 ─────────────────────────────────────────────

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ─── 导出内置表常量 (测试用) ─────────────────────────────

export const BUILTIN_TABLES = { U5, U7, U8, U9, U11, U12, U13 };
