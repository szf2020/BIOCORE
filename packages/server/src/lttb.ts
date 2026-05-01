// ============================================================
// lttb.ts — Largest-Triangle-Three-Buckets 下采样算法
//
// 论文: Sveinn Steinarsson 2013 "Downsampling Time Series for Visual Representation"
// 用途: 把 N 个时间序列点压缩到 threshold 个,保留视觉上的极值与拐点
//
// 复杂度: O(N), 内存 O(threshold)
// ============================================================

/**
 * LTTB 下采样: 把 data 压到 threshold 个点,保留视觉极值
 *
 * @param data 原始数据点数组
 * @param threshold 目标点数 (≥ 3)
 * @param getX 取 x 值 (通常是 timestamp)
 * @param getY 取 y 值
 * @returns 下采样后的子集 (引用原数据点, 不复制)
 *
 * 边界条件:
 * - threshold ≥ data.length 时直接返回原数组
 * - threshold ≤ 2 时返回首尾两点
 * - data.length ≤ 2 时直接返回原数组
 */
export function lttb<T>(
  data: T[],
  threshold: number,
  getX: (d: T) => number,
  getY: (d: T) => number
): T[] {
  const n = data.length;
  if (threshold >= n || n <= 2) return data;
  if (threshold <= 2) return [data[0], data[n - 1]];

  const sampled: T[] = [];
  let sampledIndex = 0;

  // 桶大小: 排除首尾, 中间分成 threshold-2 个桶
  const every = (n - 2) / (threshold - 2);

  // 第一个点: 始终保留
  let a = 0;
  sampled[sampledIndex++] = data[a];

  for (let i = 0; i < threshold - 2; i++) {
    // 计算下一个桶的平均点 (作为三角形的第三个顶点)
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * every) + 1;
    let avgRangeEnd = Math.floor((i + 2) * every) + 1;
    avgRangeEnd = avgRangeEnd < n ? avgRangeEnd : n;
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    if (avgRangeLength > 0) {
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += getX(data[j]);
        avgY += getY(data[j]);
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    } else {
      // 边界 fallback
      avgX = getX(data[avgRangeStart < n ? avgRangeStart : n - 1]);
      avgY = getY(data[avgRangeStart < n ? avgRangeStart : n - 1]);
    }

    // 当前桶的范围
    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;

    // a 是上一桶选中的点
    const pointAX = getX(data[a]);
    const pointAY = getY(data[a]);

    // 在当前桶中找到与三角形 [a, candidate, avg] 面积最大的 candidate
    let maxArea = -1;
    let nextA = rangeOffs;
    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pointAX - avgX) * (getY(data[j]) - pointAY) -
        (pointAX - getX(data[j])) * (avgY - pointAY)
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }

    sampled[sampledIndex++] = data[nextA];
    a = nextA;
  }

  // 最后一个点: 始终保留
  sampled[sampledIndex++] = data[n - 1];

  return sampled;
}

// ============================================================
// 自测块: `node lttb.js` 或 `tsx lttb.ts`
// ============================================================
if (require.main === module) {
  // 合成 1000 点序列, 第 234 点是峰值
  const data: { x: number; y: number }[] = [];
  for (let i = 0; i < 1000; i++) {
    let y = Math.sin(i * 0.05) * 10;
    if (i === 234) y = 1000; // 极值
    if (i === 678) y = -800; // 谷
    data.push({ x: i, y });
  }

  const sampled = lttb(data, 100, d => d.x, d => d.y);
  console.log(`输入 ${data.length} 点, 下采样到 ${sampled.length} 点`);

  // 验证极值保留
  const hasMax = sampled.some(d => d.y === 1000);
  const hasMin = sampled.some(d => d.y === -800);
  console.log(`保留峰值 (y=1000): ${hasMax ? '✓' : '✗'}`);
  console.log(`保留谷值 (y=-800): ${hasMin ? '✓' : '✗'}`);

  // 边界测试
  console.log('--- 边界测试 ---');
  console.log(`threshold > n: ${lttb(data, 5000, d => d.x, d => d.y).length === 1000 ? '✓ 返回原数组' : '✗'}`);
  console.log(`threshold = 2: ${lttb(data, 2, d => d.x, d => d.y).length === 2 ? '✓ 返回首尾' : '✗'}`);
  console.log(`n = 1: ${lttb([{x:0,y:0}], 100, d => d.x, d => d.y).length === 1 ? '✓' : '✗'}`);

  if (!hasMax || !hasMin) {
    process.exit(1);
  }
}
