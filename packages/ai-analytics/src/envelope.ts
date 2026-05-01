// 历史批次包络线 (均值 ± 2σ)

export function buildEnvelope(batches: number[][]): { mean: number[]; upper: number[]; lower: number[] } {
  if (batches.length === 0) return { mean: [], upper: [], lower: [] };

  const maxLen = Math.max(...batches.map(b => b.length));
  const mean: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < maxLen; i++) {
    const vals = batches.map(b => b[i]).filter(v => v !== undefined);
    if (vals.length === 0) { mean.push(0); upper.push(0); lower.push(0); continue; }

    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);

    mean.push(avg);
    upper.push(avg + 2 * std);
    lower.push(avg - 2 * std);
  }

  return { mean, upper, lower };
}

export function checkEnvelope(
  current: number[],
  envelope: { mean: number[]; upper: number[]; lower: number[] },
): { inBand: boolean; deviations: number[] } {
  const deviations: number[] = [];
  let inBand = true;

  for (let i = 0; i < current.length && i < envelope.mean.length; i++) {
    if (current[i] > envelope.upper[i] || current[i] < envelope.lower[i]) {
      inBand = false;
      deviations.push(current[i] - envelope.mean[i]);
    } else {
      deviations.push(0);
    }
  }

  return { inBand, deviations };
}
