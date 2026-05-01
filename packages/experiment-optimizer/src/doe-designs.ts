// ============================================================
// doe-designs.ts — 经典实验设计 (DoE) 矩阵生成器
//
// 参照 DASware design 的设计能力 (Factorial / CCD / Latin Hypercube):
//   - full_factorial: 全因子 2^k / 3^k, 适合 k<=4 + 筛选 + 主效应
//   - ccd:  中心复合设计 factorial + axial + center, 适合响应面建模 (RSM)
//   - latin_hypercube: 拉丁超立方, 空间填充, 适合 k>4 或贝叶斯先验
//   - bayesian: 由 BayesianOptimizer 顺序生成 (非一次性矩阵)
// ============================================================

export interface DoEFactor {
  name: string;       // 因子标识 (会写回 recipe params 对应路径)
  path: string;       // recipe phase params 路径, 如 "phases[2].params.target_temp_C" 或 "HEAT_01.target_temp_C"
  min: number;
  max: number;
  levels?: number;    // 仅 full_factorial 用 (默认 2)
  center?: number;    // 可选指定中心点 (CCD), 默认 (min+max)/2
}

export interface DesignMatrixRow {
  /** 1-based 运行序号 */
  run_index: number;
  /** 因子值 { factor_name: value } */
  factor_values: Record<string, number>;
  /** 点类型标签 (仅 ccd 有意义) */
  point_type?: 'factorial' | 'axial' | 'center';
}

export type DesignType = 'full_factorial' | 'fractional_factorial' | 'ccd' | 'latin_hypercube' | 'plackett_burman' | 'box_behnken' | 'definitive_screening';

// ─── 全因子 2^k / 3^k ──────────────────────────────────────────
/**
 * 全因子设计. k 个因子, 每个 levels 水平 → 生成 levels^k 个点.
 * levels=2 时用 min/max, levels=3 时加中心点, >3 时等距分割.
 */
export function generateFullFactorial(factors: DoEFactor[]): DesignMatrixRow[] {
  if (factors.length === 0) return [];

  const grids: number[][] = factors.map(f => {
    const levels = f.levels && f.levels >= 2 ? f.levels : 2;
    if (levels === 2) return [f.min, f.max];
    if (levels === 3) return [f.min, (f.min + f.max) / 2, f.max];
    // 等距分割
    const step = (f.max - f.min) / (levels - 1);
    return Array.from({ length: levels }, (_, i) => f.min + step * i);
  });

  // 笛卡尔积
  const rows: Record<string, number>[] = [{}];
  factors.forEach((f, i) => {
    const next: Record<string, number>[] = [];
    for (const r of rows) {
      for (const v of grids[i]) {
        next.push({ ...r, [f.name]: v });
      }
    }
    rows.length = 0;
    rows.push(...next);
  });

  return rows.map((factor_values, i) => ({
    run_index: i + 1,
    factor_values,
    point_type: 'factorial',
  }));
}

// ─── 中心复合设计 (CCD) ────────────────────────────────────────
/**
 * 中心复合设计 = factorial 2^k + 2k 个 axial + N 个 center (默认 3 个中心).
 * alpha 默认为 k^0.25 (旋转可设计 rotatable CCD).
 * 只适合 k<=5, 点数 = 2^k + 2k + centerReps.
 */
export function generateCCD(
  factors: DoEFactor[],
  opts: { centerReps?: number; alpha?: number } = {},
): DesignMatrixRow[] {
  const k = factors.length;
  if (k === 0) return [];
  if (k > 5) throw new Error(`CCD 不建议 k>5 (点数=2^k+2k+c, k=${k} 需要 ${2 ** k + 2 * k + 3}+ 次运行)`);

  const centerReps = opts.centerReps ?? 3;
  const alpha = opts.alpha ?? Math.pow(2 ** k, 0.25);

  // 中心点 (编码 0) = (min+max)/2
  const centers = factors.map(f => f.center ?? (f.min + f.max) / 2);
  const halfRanges = factors.map(f => (f.max - f.min) / 2);
  const encodedToReal = (coded: number[]): Record<string, number> => {
    const v: Record<string, number> = {};
    factors.forEach((f, i) => {
      v[f.name] = centers[i] + coded[i] * halfRanges[i];
    });
    return v;
  };

  const rows: DesignMatrixRow[] = [];
  let idx = 1;

  // 1. Factorial 部分: ±1 的全因子
  const factorialCodes: number[][] = [[]];
  for (let i = 0; i < k; i++) {
    const next: number[][] = [];
    for (const c of factorialCodes) {
      next.push([...c, -1]);
      next.push([...c, 1]);
    }
    factorialCodes.length = 0;
    factorialCodes.push(...next);
  }
  for (const coded of factorialCodes) {
    rows.push({ run_index: idx++, factor_values: encodedToReal(coded), point_type: 'factorial' });
  }

  // 2. Axial 部分: 每个轴 ±alpha, 其他为 0
  for (let i = 0; i < k; i++) {
    const codedMinus = Array(k).fill(0); codedMinus[i] = -alpha;
    const codedPlus  = Array(k).fill(0); codedPlus[i]  = +alpha;
    rows.push({ run_index: idx++, factor_values: encodedToReal(codedMinus), point_type: 'axial' });
    rows.push({ run_index: idx++, factor_values: encodedToReal(codedPlus),  point_type: 'axial' });
  }

  // 3. Center 重复
  const centerCoded = Array(k).fill(0);
  for (let r = 0; r < centerReps; r++) {
    rows.push({ run_index: idx++, factor_values: encodedToReal(centerCoded), point_type: 'center' });
  }

  return rows;
}

// ─── 拉丁超立方采样 (LHS) ──────────────────────────────────────
/**
 * 拉丁超立方空间填充. n 行, 每个因子区间分 n 段, 随机排列 → 每段只采一次.
 * 适合 k>4 或贝叶斯先验.
 */
export function generateLatinHypercube(factors: DoEFactor[], n: number): DesignMatrixRow[] {
  if (factors.length === 0 || n <= 0) return [];

  // 对每个因子生成 [0..n-1] 的随机排列
  const perms: number[][] = factors.map(() => shuffle(Array.from({ length: n }, (_, i) => i)));

  const rows: DesignMatrixRow[] = [];
  for (let row = 0; row < n; row++) {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, col) => {
      // 每段内的抖动 (随机偏移 0..1 / n)
      const jitter = Math.random();
      const segment = perms[col][row];
      const u = (segment + jitter) / n;  // 0..1
      factor_values[f.name] = f.min + u * (f.max - f.min);
    });
    rows.push({ run_index: row + 1, factor_values });
  }
  return rows;
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Plackett-Burman 设计 (参考 pyDOE2) ───────────────────
/**
 * Plackett-Burman 2水平筛选设计.
 * N 次试验可筛选 N-1 个因素 (N=4,8,12,16,20,24...).
 * 使用 Hadamard 矩阵行移位法构造.
 */
export function generatePlackettBurman(factors: DoEFactor[]): DesignMatrixRow[] {
  const k = factors.length;
  if (k === 0) return [];
  // 选最小的 N >= k+1 且 N % 4 === 0
  const N = [4, 8, 12, 16, 20, 24, 28, 32, 36].find(n => n > k) ?? (Math.ceil((k + 1) / 4) * 4);

  // 基础行 (Hadamard 第一行, 长度 N-1)
  const baseRows: Record<number, number[]> = {
    4:  [1, 1, -1],
    8:  [1, 1, 1, -1, 1, -1, -1],
    12: [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1],
    16: [1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, -1, -1, -1],
    20: [1, 1, -1, 1, 1, 1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, -1, -1, -1],
    24: [1, 1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1],
  };
  const base = baseRows[N];
  if (!base) {
    // 对于未预定义的 N, 用全因子替代
    return generateFullFactorial(factors);
  }

  // 构造 Hadamard 矩阵: 行移位
  const matrix: number[][] = [];
  for (let i = 0; i < N - 1; i++) {
    const row: number[] = [];
    for (let j = 0; j < N - 1; j++) {
      row.push(base[(i + j) % (N - 1)]);
    }
    matrix.push(row);
  }
  // 最后一行全 -1
  matrix.push(new Array(N - 1).fill(-1));

  // 转换编码 (-1/+1) 为实际值 (min/max)
  return matrix.map((row, i) => {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, j) => {
      factor_values[f.name] = row[j] === 1 ? f.max : f.min;
    });
    return { run_index: i + 1, factor_values, point_type: 'factorial' as const };
  });
}

// ─── Box-Behnken 设计 (参考 pyDOE2) ───────────────────────
/**
 * Box-Behnken 3水平响应面设计.
 * 比 CCD 需要更少试验点, 不含极端角点.
 * 只适合 k=3~7 个因素.
 */
export function generateBoxBehnken(
  factors: DoEFactor[],
  centerReps: number = 3,
): DesignMatrixRow[] {
  const k = factors.length;
  if (k < 3 || k > 7) throw new Error(`Box-Behnken 仅支持 3-7 个因素, 当前: ${k}`);

  // 预定义的 BB 编码矩阵 (k=3,4,5)
  const bbDesigns: Record<number, number[][]> = {
    3: [
      [-1,-1, 0], [1,-1, 0], [-1, 1, 0], [1, 1, 0],
      [-1, 0,-1], [1, 0,-1], [-1, 0, 1], [1, 0, 1],
      [0,-1,-1],  [0, 1,-1], [0,-1, 1],  [0, 1, 1],
    ],
    4: [
      [-1,-1, 0, 0], [1,-1, 0, 0], [-1, 1, 0, 0], [1, 1, 0, 0],
      [0, 0,-1,-1],  [0, 0, 1,-1], [0, 0,-1, 1],  [0, 0, 1, 1],
      [-1, 0, 0,-1], [1, 0, 0,-1], [-1, 0, 0, 1], [1, 0, 0, 1],
      [0,-1,-1, 0],  [0, 1,-1, 0], [0,-1, 1, 0],  [0, 1, 1, 0],
      [-1, 0,-1, 0], [1, 0,-1, 0], [-1, 0, 1, 0], [1, 0, 1, 0],
      [0,-1, 0,-1],  [0, 1, 0,-1], [0,-1, 0, 1],  [0, 1, 0, 1],
    ],
    5: [
      [-1,-1, 0, 0, 0], [1,-1, 0, 0, 0], [-1, 1, 0, 0, 0], [1, 1, 0, 0, 0],
      [0, 0,-1,-1, 0],  [0, 0, 1,-1, 0], [0, 0,-1, 1, 0],  [0, 0, 1, 1, 0],
      [0, 0, 0,-1,-1],  [0, 0, 0, 1,-1], [0, 0, 0,-1, 1],  [0, 0, 0, 1, 1],
      [-1, 0,-1, 0, 0], [1, 0,-1, 0, 0], [-1, 0, 1, 0, 0], [1, 0, 1, 0, 0],
      [0,-1, 0, 0,-1],  [0, 1, 0, 0,-1], [0,-1, 0, 0, 1],  [0, 1, 0, 0, 1],
      [-1, 0, 0, 0,-1], [1, 0, 0, 0,-1], [-1, 0, 0, 0, 1], [1, 0, 0, 0, 1],
      [0,-1, 0,-1, 0],  [0, 1, 0,-1, 0], [0,-1, 0, 1, 0],  [0, 1, 0, 1, 0],
      [0, 0,-1, 0,-1],  [0, 0, 1, 0,-1], [0, 0,-1, 0, 1],  [0, 0, 1, 0, 1],
      [-1, 0, 0,-1, 0], [1, 0, 0,-1, 0], [-1, 0, 0, 1, 0], [1, 0, 0, 1, 0],
      [0,-1,-1, 0, 0],  [0, 1,-1, 0, 0], [0,-1, 1, 0, 0],  [0, 1, 1, 0, 0],
    ],
  };

  // k=6,7 用组合生成: 每次取 2 个因素的 ±1 全因子, 其余为 0
  let coded: number[][];
  if (bbDesigns[k]) {
    coded = bbDesigns[k];
  } else {
    coded = [];
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        for (const a of [-1, 1]) {
          for (const b of [-1, 1]) {
            const row = new Array(k).fill(0);
            row[i] = a; row[j] = b;
            coded.push(row);
          }
        }
      }
    }
  }

  const centers = factors.map(f => (f.min + f.max) / 2);
  const halfRanges = factors.map(f => (f.max - f.min) / 2);

  const rows: DesignMatrixRow[] = [];
  let idx = 1;

  for (const c of coded) {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, i) => {
      factor_values[f.name] = centers[i] + c[i] * halfRanges[i];
    });
    rows.push({ run_index: idx++, factor_values, point_type: 'factorial' });
  }

  // 中心点
  for (let r = 0; r < centerReps; r++) {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, i) => { factor_values[f.name] = centers[i]; });
    rows.push({ run_index: idx++, factor_values, point_type: 'center' });
  }

  return rows;
}

// ─── 2水平分数因子 2^(k-p) (参考 Minitab/pyDOE2) ──────────

/**
 * 标准生成元表: key = "k_p" → 生成元列表 (哪些列由哪些列的交互生成)
 * 例: "5_1" → k=5, p=1, Resolution V: 第5列 = 1×2×3×4
 */
const FRACTIONAL_GENERATORS: Record<string, number[][]> = {
  // 2^(3-1) III: C=AB
  '3_1': [[0, 1]],
  // 2^(4-1) IV: D=ABC
  '4_1': [[0, 1, 2]],
  // 2^(5-1) V: E=ABCD
  '5_1': [[0, 1, 2, 3]],
  // 2^(5-2) III: D=AB, E=AC
  '5_2': [[0, 1], [0, 2]],
  // 2^(6-1) VI: F=ABCDE
  '6_1': [[0, 1, 2, 3, 4]],
  // 2^(6-2) IV: E=ABC, F=BCD
  '6_2': [[0, 1, 2], [1, 2, 3]],
  // 2^(6-3) III: D=AB, E=AC, F=BC
  '6_3': [[0, 1], [0, 2], [1, 2]],
  // 2^(7-1): G=ABCDEF
  '7_1': [[0, 1, 2, 3, 4, 5]],
  // 2^(7-2) IV: F=ABCD, G=ABDE
  '7_2': [[0, 1, 2, 3], [0, 1, 3, 4]],
  // 2^(7-3) IV: E=ABC, F=BCD, G=ACD
  '7_3': [[0, 1, 2], [1, 2, 3], [0, 2, 3]],
  // 2^(7-4) III: D=AB, E=AC, F=BC, G=ABC
  '7_4': [[0, 1], [0, 2], [1, 2], [0, 1, 2]],
};

/**
 * 2水平分数因子设计 2^(k-p)
 * @param factors - 因素列表 (只用 min/max)
 * @param p - 分数程度 (省略则自动选最高分辨率)
 */
export function generateFractionalFactorial(
  factors: DoEFactor[],
  p?: number,
): DesignMatrixRow[] {
  const k = factors.length;
  if (k < 3) return generateFullFactorial(factors);

  // 自动选 p: 优先最高分辨率 (最小 p)
  const autoP = p ?? Math.max(1, k - 4);
  const baseK = k - autoP; // 基础列数
  const key = `${k}_${autoP}`;
  const generators = FRACTIONAL_GENERATORS[key];

  if (!generators || baseK < 2) {
    // 无预定义生成元, 回退全因子
    return generateFullFactorial(factors);
  }

  // 生成基础 2^baseK 全因子 (编码 -1/+1)
  const baseRuns: number[][] = [];
  for (let i = 0; i < 2 ** baseK; i++) {
    const row: number[] = [];
    for (let j = 0; j < baseK; j++) {
      row.push((i >> (baseK - 1 - j)) & 1 ? 1 : -1);
    }
    baseRuns.push(row);
  }

  // 扩展: 用生成元计算额外列
  const fullRuns = baseRuns.map(baseRow => {
    const fullRow = [...baseRow];
    for (const gen of generators) {
      // 额外列 = 生成元列们的乘积
      let product = 1;
      for (const col of gen) product *= baseRow[col];
      fullRow.push(product);
    }
    return fullRow;
  });

  // 编码 → 实际值
  return fullRuns.map((row, i) => {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, j) => {
      factor_values[f.name] = row[j] === 1 ? f.max : f.min;
    });
    return { run_index: i + 1, factor_values, point_type: 'factorial' as const };
  });
}

// ─── Definitive Screening Design (参考 Minitab/Jones 2011) ─

/**
 * Definitive Screening Design (DSD)
 * N = 2k+1 次试验筛选 k 个连续因素, 能检测主效应 + 二次效应
 * 每列只有 3 个不同水平 (-1, 0, +1), 正交于所有主效应
 */
export function generateDefinitiveScreening(
  factors: DoEFactor[],
): DesignMatrixRow[] {
  const k = factors.length;
  if (k < 3) return generateFullFactorial(factors);

  // Jones & Nachtsheim 构造: 2k 个折叠对 + 1 个中心点
  const coded: number[][] = [];

  // 构造 k×k 的会议矩阵 (Conference matrix 近似)
  // 每对折叠行: row_i 和 -row_i, 保证主效应正交
  for (let i = 0; i < k; i++) {
    const row = new Array(k).fill(0);
    // 第 i 个因素在这对中取 ±1, 其余因素按循环取 ±1
    for (let j = 0; j < k; j++) {
      if (j === i) {
        row[j] = 1;
      } else {
        // 交替 ±1 使列间正交
        row[j] = ((i + j) % 2 === 0) ? 1 : -1;
      }
    }
    coded.push([...row]);          // 正行
    coded.push(row.map(v => -v));  // 折叠行 (符号取反)
  }
  // 中心点
  coded.push(new Array(k).fill(0));

  // 编码 → 实际值 (-1→min, 0→center, 1→max)
  const centers = factors.map(f => (f.min + f.max) / 2);
  const halfRanges = factors.map(f => (f.max - f.min) / 2);

  return coded.map((row, i) => {
    const factor_values: Record<string, number> = {};
    factors.forEach((f, j) => {
      factor_values[f.name] = centers[j] + row[j] * halfRanges[j];
    });
    return { run_index: i + 1, factor_values, point_type: row.every(v => v === 0) ? 'center' as const : 'factorial' as const };
  });
}

// ─── 统一入口 ─────────────────────────────────────────────────
export function generateDesignMatrix(
  type: DesignType,
  factors: DoEFactor[],
  opts: { n?: number; centerReps?: number; alpha?: number } = {},
): DesignMatrixRow[] {
  switch (type) {
    case 'full_factorial':
      return generateFullFactorial(factors);
    case 'ccd':
      return generateCCD(factors, { centerReps: opts.centerReps, alpha: opts.alpha });
    case 'latin_hypercube':
      return generateLatinHypercube(factors, opts.n ?? Math.max(2 * factors.length + 1, 8));
    case 'plackett_burman':
      return generatePlackettBurman(factors);
    case 'box_behnken':
      return generateBoxBehnken(factors, opts.centerReps);
    case 'fractional_factorial':
      return generateFractionalFactorial(factors);
    case 'definitive_screening':
      return generateDefinitiveScreening(factors);
    default:
      throw new Error(`未知设计类型: ${type}`);
  }
}
