// ============================================================
// feed-calculator.ts — Feed rate calculation strategies
// Exponential feed for fed-batch and DO-stat for oxygen-limited cultures
// ============================================================

/**
 * Calculate exponential feed rate for fed-batch fermentation.
 * F(t) = F0 x exp(mu_set x t), capped at maxRate.
 *
 * @param params.initialRate  F0 in mL/h — starting feed rate
 * @param params.mu_set       Target specific growth rate (1/h)
 * @param params.elapsedHours Hours since feed start
 * @param params.maxRate      Maximum allowed feed rate (mL/h)
 * @returns Feed rate in mL/h
 */
export function calculateExponentialFeedRate(params: {
  initialRate: number;
  mu_set: number;
  elapsedHours: number;
  maxRate: number;
}): number {
  const { initialRate, mu_set, elapsedHours, maxRate } = params;

  if (initialRate <= 0 || elapsedHours < 0) {
    return 0;
  }

  const rate = initialRate * Math.exp(mu_set * elapsedHours);
  return Math.min(maxRate, rate);
}

/**
 * Calculate DO-stat feed rate adjustment.
 * When DO > setpoint the culture is substrate-limited → increase feed.
 * When DO < setpoint the culture is oxygen-limited → decrease feed.
 *
 * @param params.currentDO       Current dissolved oxygen (%)
 * @param params.doSetpoint      DO setpoint (%)
 * @param params.currentFeedRate Current feed rate (mL/h)
 * @param params.minRate         Minimum allowed feed rate (mL/h)
 * @param params.maxRate         Maximum allowed feed rate (mL/h)
 * @returns Adjusted feed rate in mL/h
 */
export function calculateDOStatFeedRate(params: {
  currentDO: number;
  doSetpoint: number;
  currentFeedRate: number;
  minRate: number;
  maxRate: number;
}): number {
  const { currentDO, doSetpoint, currentFeedRate, minRate, maxRate } = params;

  // Proportional gain: 0.1 mL/h per 1% DO error
  const error = currentDO - doSetpoint;
  const adjustment = error * 0.1;

  const newRate = currentFeedRate + adjustment;
  return Math.max(minRate, Math.min(maxRate, newRate));
}
