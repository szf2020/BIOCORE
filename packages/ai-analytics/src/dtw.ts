// Dynamic Time Warping — 批次相似度匹配

export function dtwDistance(a: number[], b: number[]): number {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return Infinity;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[n][m];
}

export function rankBySimilarity(
  target: number[],
  historicals: { batchId: string; data: number[] }[],
): { batchId: string; distance: number }[] {
  return historicals
    .map(h => ({ batchId: h.batchId, distance: dtwDistance(target, h.data) }))
    .sort((a, b) => a.distance - b.distance);
}
