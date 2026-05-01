// ============================================================
// metabolic-inference.ts — pH / base-consumption metabolic state inference
// Uses alkali consumption rate and pH trend to infer growth phase
// ============================================================

export interface MetabolicState {
  state: 'normal' | 'overflow' | 'substrate_depletion' | 'lag' | 'stationary';
  confidence: number;   // 0–1
  estimatedMu: number;  // 1/h estimated from base consumption rate
  message: string;
}

/**
 * Infer the current metabolic state from base (alkali) consumption
 * rate and pH trend data.
 *
 * Heuristics:
 * - Steady base rate with rising trend → normal exponential growth
 * - Sudden drop in base rate → substrate depletion
 * - Oscillating base rate → overflow metabolism (acetate cycling)
 * - Near-zero base rate with flat pH → lag phase
 * - Declining base rate with stable pH → stationary phase
 *
 * @param params.baseConsumptionRate  Current alkali consumption (mL/h)
 * @param params.baseRateHistory      Last 10 base rate readings
 * @param params.phTrend              Last 10 pH readings
 */
export function inferMetabolicState(params: {
  baseConsumptionRate: number;
  baseRateHistory: number[];
  phTrend: number[];
}): MetabolicState {
  const { baseConsumptionRate, baseRateHistory, phTrend } = params;

  // Guard: need sufficient history
  if (baseRateHistory.length < 3 || phTrend.length < 3) {
    return {
      state: 'lag',
      confidence: 0.3,
      estimatedMu: 0,
      message: 'Insufficient data for reliable metabolic inference',
    };
  }

  // Estimate mu from base consumption rate slope
  // mu ≈ d(ln(baseRate)) / dt  (assuming 1-min intervals)
  const estimatedMu = estimateMuFromBaseRate(baseRateHistory);

  // Compute base rate slope (linear regression over window)
  const baseSlope = linearSlope(baseRateHistory);

  // Check for oscillation in base rate (overflow metabolism indicator)
  const oscillation = detectOscillation(baseRateHistory);

  // pH trend slope
  const phSlope = linearSlope(phTrend);

  // pH oscillation
  const phOscillation = detectOscillation(phTrend);

  // --- Decision logic ---

  // Overflow metabolism: base rate oscillates, often with pH oscillation
  if (oscillation > 0.3 || phOscillation > 0.15) {
    return {
      state: 'overflow',
      confidence: Math.min(1, 0.5 + oscillation),
      estimatedMu,
      message: `Overflow metabolism detected: base rate oscillation=${oscillation.toFixed(2)}, pH oscillation=${phOscillation.toFixed(2)}`,
    };
  }

  // Substrate depletion: sudden drop in base consumption rate
  if (baseRateHistory.length >= 5) {
    const recentAvg = average(baseRateHistory.slice(-3));
    const olderAvg = average(baseRateHistory.slice(0, -3));
    if (olderAvg > 0 && recentAvg / olderAvg < 0.4) {
      return {
        state: 'substrate_depletion',
        confidence: Math.min(1, 0.6 + (1 - recentAvg / olderAvg) * 0.3),
        estimatedMu,
        message: `Substrate depletion: base rate dropped from ${olderAvg.toFixed(2)} to ${recentAvg.toFixed(2)} mL/h`,
      };
    }
  }

  // Lag phase: very low base rate and flat pH
  const avgBaseRate = average(baseRateHistory);
  if (avgBaseRate < 0.5 && Math.abs(phSlope) < 0.01) {
    return {
      state: 'lag',
      confidence: 0.7,
      estimatedMu,
      message: `Lag phase: low base consumption (${avgBaseRate.toFixed(2)} mL/h), stable pH`,
    };
  }

  // Stationary phase: declining base rate with stable pH
  if (baseSlope < -0.05 && Math.abs(phSlope) < 0.02) {
    return {
      state: 'stationary',
      confidence: Math.min(1, 0.5 + Math.abs(baseSlope)),
      estimatedMu,
      message: `Stationary phase: declining base rate (slope=${baseSlope.toFixed(3)}), stable pH`,
    };
  }

  // Normal growth: steady or increasing base rate
  return {
    state: 'normal',
    confidence: Math.min(1, 0.5 + Math.abs(baseSlope) * 2),
    estimatedMu,
    message: `Normal growth: base rate=${baseConsumptionRate.toFixed(2)} mL/h, mu_est=${estimatedMu.toFixed(3)} 1/h`,
  };
}

// --- Utility functions ---

function estimateMuFromBaseRate(history: number[]): number {
  if (history.length < 2) return 0;

  const validEntries = history.filter(v => v > 0);
  if (validEntries.length < 2) return 0;

  const first = validEntries[0];
  const last = validEntries[validEntries.length - 1];
  // Assume 1-minute intervals, convert to hours
  const dtHours = (validEntries.length - 1) / 60;

  if (dtHours <= 0 || first <= 0 || last <= 0) return 0;

  return (Math.log(last) - Math.log(first)) / dtHours;
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

function detectOscillation(values: number[]): number {
  if (values.length < 4) return 0;

  // Count sign changes in first derivative
  let signChanges = 0;
  for (let i = 2; i < values.length; i++) {
    const prev = values[i - 1] - values[i - 2];
    const curr = values[i] - values[i - 1];
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      signChanges++;
    }
  }

  // Normalize: max possible sign changes = length - 2
  return signChanges / (values.length - 2);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
