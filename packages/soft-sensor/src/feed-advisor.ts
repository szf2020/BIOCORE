// ============================================================
// Feed rate advisor based on Monod kinetics + soft sensor predictions
// ============================================================

export interface FeedRecommendation {
  suggestedRate: number;  // mL/h
  reason: string;
  confidence: number;     // 0-1
  action: 'increase' | 'decrease' | 'maintain';
}

export interface FeedAdvisorParams {
  currentOD: number;
  currentGlucose: number;
  targetMu: number;
  muMax: number;          // typically 0.4-0.7 for E.coli
  Ks: number;             // typically 0.01-0.1 g/L
  Yxs: number;            // typically 0.4-0.5 g/g
  currentFeedRate: number;
  feedConcentration: number; // g/L (e.g., 500 for 500g/L glucose)
  liquidVolume: number;      // L
}

export class FeedAdvisor {
  /**
   * Calculate recommended feed rate based on:
   * - Current biomass (from soft sensor OD prediction)
   * - Target specific growth rate (μ_set)
   * - Substrate concentration (from soft sensor glucose prediction)
   * - Monod kinetics parameters (μ_max, Ks, Yxs)
   *
   * Monod equation: μ = μ_max * S / (Ks + S)
   * Feed rate for exponential feeding: F = (μ_set * X * V) / (Yxs * Sf)
   *   where X = biomass (OD600 proxy), V = volume, Sf = feed concentration
   */
  recommend(params: FeedAdvisorParams): FeedRecommendation {
    const {
      currentOD,
      currentGlucose,
      targetMu,
      muMax,
      Ks,
      Yxs,
      currentFeedRate,
      feedConcentration,
      liquidVolume,
    } = params;

    // Validate inputs
    if (currentOD <= 0) {
      return {
        suggestedRate: 0,
        reason: 'Biomass (OD600) is zero or negative; no feeding required.',
        confidence: 0.9,
        action: 'maintain',
      };
    }

    if (feedConcentration <= 0 || liquidVolume <= 0 || Yxs <= 0) {
      return {
        suggestedRate: currentFeedRate,
        reason: 'Invalid process parameters (feedConcentration, liquidVolume, or Yxs <= 0).',
        confidence: 0,
        action: 'maintain',
      };
    }

    // Current specific growth rate from Monod equation
    const denominator = Ks + currentGlucose;
    const currentMu = denominator > 0 ? muMax * currentGlucose / denominator : 0;

    // Target feed rate for exponential feeding:
    // F = (μ_set / Yxs) * X * V / Sf
    // Convert biomass OD to approximate g/L (rough: 1 OD ≈ 0.4 g/L DCW for E.coli)
    const biomassConcentration = currentOD * 0.4; // g/L
    const targetFeedRate =
      (targetMu / Yxs) * biomassConcentration * liquidVolume / feedConcentration;

    // Convert from L/h to mL/h
    const suggestedRate = Math.max(0, targetFeedRate * 1000);

    // Determine action
    const rateDiff = suggestedRate - currentFeedRate;
    const relativeChange = currentFeedRate > 0 ? Math.abs(rateDiff) / currentFeedRate : 1;

    let action: 'increase' | 'decrease' | 'maintain';
    let reason: string;

    if (relativeChange < 0.05) {
      action = 'maintain';
      reason = `Current feed rate is within 5% of optimal. μ_current=${currentMu.toFixed(3)}/h, μ_target=${targetMu.toFixed(3)}/h.`;
    } else if (rateDiff > 0) {
      action = 'increase';
      if (currentGlucose < Ks) {
        reason = `Glucose (${currentGlucose.toFixed(2)} g/L) is below Ks (${Ks} g/L) — substrate-limited. Increase feed to maintain μ_target=${targetMu.toFixed(3)}/h.`;
      } else {
        reason = `Biomass growing; increase feed to sustain exponential growth at μ_target=${targetMu.toFixed(3)}/h.`;
      }
    } else {
      action = 'decrease';
      if (currentGlucose > 5.0) {
        reason = `Glucose accumulating (${currentGlucose.toFixed(2)} g/L) — risk of overflow metabolism. Reduce feed rate.`;
      } else {
        reason = `Feed rate exceeds demand for μ_target=${targetMu.toFixed(3)}/h. Reduce to avoid substrate accumulation.`;
      }
    }

    // Confidence based on how well Monod kinetics match
    // Lower confidence when glucose is very high (overflow metabolism) or very low (starvation)
    let confidence = 0.8;
    if (currentGlucose < 0.001) {
      confidence = 0.5; // Possible starvation, sensor might be inaccurate
    } else if (currentGlucose > 10) {
      confidence = 0.6; // Overflow metabolism zone, Monod less reliable
    } else if (currentMu > 0 && Math.abs(currentMu - targetMu) / targetMu < 0.1) {
      confidence = 0.95; // Close to target, high confidence
    }

    return {
      suggestedRate: Math.round(suggestedRate * 100) / 100,
      reason,
      confidence,
      action,
    };
  }
}
