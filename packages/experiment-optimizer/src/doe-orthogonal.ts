// ============================================================
// doe-orthogonal.ts — 正交试验设计表生成器
//
// 参考《试验设计与数据处理》第4章:
//   正交表从全面试验中挑选少部分代表性强的试验,
//   各水平搭配均衡地分散在所有组合中.
//
// 内置正交表: L4(2³), L8(2⁷), L9(3⁴), L16(4⁵), L18(2¹×3⁷), L27(3¹³)
// ============================================================

import type {
  DOEFactor,
  OrthogonalArrayMeta,
  OrthogonalDesign,
  OrthogonalRun,
} from './doe-types';

// ─── 内置正交表 (硬编码, 与教科书附表一致) ─────────────────

/** L4(2³): 4次试验, 2水平, 最多3因素 */
const L4: OrthogonalArrayMeta = {
  name: 'L4(2³)',
  runs: 4,
  levelCount: 2,
  maxFactors: 3,
  matrix: [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ],
};

/** L8(2⁷): 8次试验, 2水平, 最多7因素 */
const L8: OrthogonalArrayMeta = {
  name: 'L8(2⁷)',
  runs: 8,
  levelCount: 2,
  maxFactors: 7,
  matrix: [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 0, 0],
    [1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 1, 0, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 1, 0, 0, 1],
  ],
};

/** L9(3⁴): 9次试验, 3水平, 最多4因素 */
const L9: OrthogonalArrayMeta = {
  name: 'L9(3⁴)',
  runs: 9,
  levelCount: 3,
  maxFactors: 4,
  matrix: [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 2, 2, 2],
    [1, 0, 1, 2],
    [1, 1, 2, 0],
    [1, 2, 0, 1],
    [2, 0, 2, 1],
    [2, 1, 0, 2],
    [2, 2, 1, 0],
  ],
};

/** L16(2¹⁵): 16次试验, 2水平, 最多15因素 (标准 2^4 全因子扩展) */
const L16: OrthogonalArrayMeta = {
  name: 'L16(2¹⁵)',
  runs: 16,
  levelCount: 2,
  maxFactors: 15,
  matrix: [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
    [0,0,0,1,1,1,1,0,0,0,0,1,1,1,1],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],
    [0,1,1,0,0,1,1,1,1,0,0,1,1,0,0],
    [0,1,1,1,1,0,0,0,0,1,1,1,1,0,0],
    [0,1,1,1,1,0,0,1,1,0,0,0,0,1,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,0,1,0,1,0,1,1,0,1,0,1,0,1,0],
    [1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],
    [1,0,1,1,0,1,0,1,0,1,0,0,1,0,1],
    [1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],
    [1,1,0,0,1,1,0,1,0,0,1,1,0,0,1],
    [1,1,0,1,0,0,1,0,1,1,0,1,0,0,1],
    [1,1,0,1,0,0,1,1,0,0,1,0,1,1,0],
  ],
};

/** L18(2¹×3⁷): 18次试验, 混合水平, 1个2水平 + 最多7个3水平因素 */
const L18: OrthogonalArrayMeta = {
  name: 'L18(2¹×3⁷)',
  runs: 18,
  levelCount: 3, // 主水平数为3, 第1列为2水平
  maxFactors: 8,
  matrix: [
    // 列1(2水平) 列2-8(3水平)
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1],
    [0, 0, 2, 2, 2, 2, 2, 2],
    [0, 1, 0, 0, 1, 1, 2, 2],
    [0, 1, 1, 1, 2, 2, 0, 0],
    [0, 1, 2, 2, 0, 0, 1, 1],
    [0, 2, 0, 1, 0, 2, 1, 2],
    [0, 2, 1, 2, 1, 0, 2, 0],
    [0, 2, 2, 0, 2, 1, 0, 1],
    [1, 0, 0, 2, 2, 1, 1, 0],
    [1, 0, 1, 0, 0, 2, 2, 1],
    [1, 0, 2, 1, 1, 0, 0, 2],
    [1, 1, 0, 1, 2, 0, 2, 1],
    [1, 1, 1, 2, 0, 1, 0, 2],
    [1, 1, 2, 0, 1, 2, 1, 0],
    [1, 2, 0, 2, 1, 2, 0, 1],
    [1, 2, 1, 0, 2, 0, 1, 2],
    [1, 2, 2, 1, 0, 1, 2, 0],
  ],
};

/** L27(3¹³): 27次试验, 3水平, 最多13因素 */
const L27: OrthogonalArrayMeta = {
  name: 'L27(3¹³)',
  runs: 27,
  levelCount: 3,
  maxFactors: 13,
  matrix: generateL27Matrix(),
};

/**
 * 生成 L27(3^13) 正交表矩阵
 * 基于 3^3 全因子设计, 用因素间乘积关系(mod 3)扩展列
 */
function generateL27Matrix(): number[][] {
  const rows: number[][] = [];
  // 3个独立列 (3^3 全因子)
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      for (let c = 0; c < 3; c++) {
        // 13列: 3独立 + 10交互列 (mod 3 运算)
        rows.push([
          a,                          // 列1
          b,                          // 列2
          (a + b) % 3,               // 列3 = 1×2
          (a + 2 * b) % 3,           // 列4 = 1×2²
          c,                          // 列5
          (a + c) % 3,               // 列6 = 1×5
          (a + 2 * c) % 3,           // 列7 = 1×5²
          (b + c) % 3,               // 列8 = 2×5
          (b + 2 * c) % 3,           // 列9 = 2×5²
          ((a + b) % 3 + c) % 3,     // 列10 = 3×5
          ((a + b) % 3 + 2 * c) % 3, // 列11 = 3×5²
          ((a + 2 * b) % 3 + c) % 3,     // 列12 = 4×5
          ((a + 2 * b) % 3 + 2 * c) % 3, // 列13 = 4×5²
        ]);
      }
    }
  }
  return rows;
}

// ─── 正交表注册表 ─────────────────────────────────────────

/** 所有内置正交表, 按 (水平数, 试验次数) 索引 */
const ORTHOGONAL_ARRAYS: OrthogonalArrayMeta[] = [L4, L8, L9, L16, L18, L27];

/** 获取所有可用正交表 */
export function listOrthogonalArrays(): OrthogonalArrayMeta[] {
  return ORTHOGONAL_ARRAYS.map(a => ({ ...a, matrix: [] })); // 不暴露大矩阵
}

/** 按名称获取正交表 */
export function getOrthogonalArray(name: string): OrthogonalArrayMeta | null {
  return ORTHOGONAL_ARRAYS.find(a => a.name === name) ?? null;
}

// ─── 自动选表 ──────────────────────────────────────────────

/**
 * 根据因素数和水平数, 自动选择最合适的正交表
 *
 * 选表原则 (参考第4章):
 * 1. 水平数匹配 (L9/L27 用于3水平, L4/L8/L16 用于2水平)
 * 2. 列数 >= 因素数
 * 3. 试验次数尽量少
 * 4. 优先留空列用于误差估计
 */
export function selectOrthogonalArray(
  factorCount: number,
  levelCount: number,
): OrthogonalArrayMeta | null {
  // 筛选水平数匹配且列数足够的表
  const candidates = ORTHOGONAL_ARRAYS
    .filter(a => a.levelCount === levelCount || a.name.includes(`${levelCount}`))
    .filter(a => a.maxFactors >= factorCount)
    .filter(a => {
      // 对于 L18 混合水平表, 3水平因素最多用列2-8 (7列)
      if (a.name === 'L18(2¹×3⁷)' && levelCount === 3) return factorCount <= 7;
      return true;
    })
    .sort((a, b) => a.runs - b.runs); // 优先试验次数少的

  return candidates[0] ?? null;
}

// ─── 正交试验设计生成 ──────────────────────────────────────

/**
 * 生成正交试验设计方案
 *
 * @param factors - 因素列表 (每个因素的水平数必须与正交表匹配)
 * @param arrayName - 指定使用的正交表名称 (可选, 不指定则自动选择)
 * @param columnAssignment - 手动指定因素-列分配 (可选)
 */
export function generateOrthogonalDesign(
  factors: DOEFactor[],
  arrayName?: string,
  columnAssignment?: Record<string, number>,
): OrthogonalDesign {
  if (factors.length === 0) {
    throw new Error('至少需要1个因素');
  }

  // 检查所有因素水平数一致 (除 L18 混合水平)
  const levelCounts = factors.map(f => f.levels.length);
  const primaryLevelCount = levelCounts[0];

  // 获取或自动选择正交表
  let array: OrthogonalArrayMeta | null = null;
  if (arrayName) {
    array = getOrthogonalArray(arrayName);
    if (!array) throw new Error(`未找到正交表: ${arrayName}`);
  } else {
    array = selectOrthogonalArray(factors.length, primaryLevelCount);
    if (!array) {
      throw new Error(
        `没有合适的正交表: ${factors.length}个因素, ${primaryLevelCount}水平. ` +
        `可用正交表: ${ORTHOGONAL_ARRAYS.map(a => a.name).join(', ')}`
      );
    }
  }

  // 验证因素数不超过列数
  if (factors.length > array.maxFactors) {
    throw new Error(
      `因素数(${factors.length})超过正交表${array.name}的最大列数(${array.maxFactors})`
    );
  }

  // 分配因素到列
  const assignment: Record<string, number> = columnAssignment ?? {};
  if (!columnAssignment) {
    // 默认按顺序分配
    // L18 特殊处理: 2水平因素放第1列, 3水平因素从第2列开始
    if (array.name === 'L18(2¹×3⁷)') {
      let col2 = 0; // 2水平列指针
      let col3 = 1; // 3水平列指针
      for (const f of factors) {
        if (f.levels.length === 2) {
          assignment[f.name] = col2++;
        } else {
          assignment[f.name] = col3++;
        }
      }
    } else {
      factors.forEach((f, i) => {
        assignment[f.name] = i;
      });
    }
  }

  // 计算空列
  const usedColumns = new Set(Object.values(assignment));
  const errorColumns: number[] = [];
  for (let i = 0; i < array.maxFactors; i++) {
    if (!usedColumns.has(i)) errorColumns.push(i);
  }

  // 生成试验方案
  const runs: OrthogonalRun[] = array.matrix.map((row, i) => {
    const factorValues: Record<string, number> = {};
    const factorLevels: Record<string, number> = {};

    for (const f of factors) {
      const col = assignment[f.name];
      const levelIndex = row[col]; // 0-based 水平编号
      factorValues[f.name] = f.levels[levelIndex];
      factorLevels[f.name] = levelIndex + 1; // 1-based 输出
    }

    return {
      runIndex: i + 1,
      factorValues,
      factorLevels,
    };
  });

  return {
    array,
    columnAssignment: assignment,
    errorColumns,
    runs,
  };
}

// ─── 导出内置表常量 (测试用) ─────────────────────────────

export const BUILTIN_ARRAYS = { L4, L8, L9, L16, L18, L27 };
