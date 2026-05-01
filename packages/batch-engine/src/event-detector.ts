// ============================================================
// event-detector.ts — Fermentation event detection
// Detects DO spikes, lag phase end, overflow metabolism,
// and log phase end from time-series process data
// ============================================================

export interface DetectionResult {
  detected: boolean;
}

export interface DOSpikeResult extends DetectionResult {
  magnitude: number;  // % rise from recent minimum
}

export interface LagEndResult extends DetectionResult {
  time_index: number; // index in history where lag ended
}

export interface OverflowResult extends DetectionResult {
  severity: number;   // 0–1 oscillation severity
}

export interface LogEndResult extends DetectionResult {
  peakMu: number;     // maximum mu observed before decline
}

export class EventDetector {
  /**
   * Detect a DO spike: DO rises >30% from recent minimum within 5 data points.
   * A DO spike typically indicates substrate depletion — cells stop consuming
   * oxygen when carbon source is exhausted.
   *
   * @param doHistory Recent DO readings (%), newest last
   */
  detectDOSpike(doHistory: number[]): DOSpikeResult {
    if (doHistory.length < 5) {
      return { detected: false, magnitude: 0 };
    }

    // Look at the last 5 readings
    const window = doHistory.slice(-5);
    const recentMin = Math.min(...window.slice(0, -1));
    const current = window[window.length - 1];

    if (recentMin <= 0) {
      return { detected: false, magnitude: 0 };
    }

    const rise = ((current - recentMin) / recentMin) * 100;

    return {
      detected: rise > 30,
      magnitude: Math.round(rise * 100) / 100,
    };
  }

  /**
   * Detect end of lag phase: OUR starts increasing consistently.
   * Looks for 3 consecutive increases in OUR values after a flat period.
   *
   * @param ourHistory OUR readings (mmol/L/h), newest last
   */
  detectLagEnd(ourHistory: number[]): LagEndResult {
    if (ourHistory.length < 5) {
      return { detected: false, time_index: -1 };
    }

    // Find the first index where 3 consecutive increases occur
    for (let i = 1; i < ourHistory.length - 2; i++) {
      const inc1 = ourHistory[i] > ourHistory[i - 1];
      const inc2 = ourHistory[i + 1] > ourHistory[i];
      const inc3 = ourHistory[i + 2] > ourHistory[i + 1];

      if (inc1 && inc2 && inc3) {
        // Verify there was a preceding flat/low period
        const preceding = ourHistory.slice(0, i);
        if (preceding.length >= 2) {
          const avgPreceding = preceding.reduce((a, b) => a + b, 0) / preceding.length;
          const stdPreceding = Math.sqrt(
            preceding.reduce((sum, v) => sum + Math.pow(v - avgPreceding, 2), 0) / preceding.length
          );

          // Low coefficient of variation in preceding period suggests lag
          if (avgPreceding === 0 || stdPreceding / avgPreceding < 0.3) {
            return { detected: true, time_index: i };
          }
        }

        // If not enough preceding data, still report if OUR values are rising from near-zero
        if (ourHistory[i - 1] < 1.0) {
          return { detected: true, time_index: i };
        }
      }
    }

    return { detected: false, time_index: -1 };
  }

  /**
   * Detect overflow metabolism: base consumption rate oscillates.
   * Overflow metabolism (e.g., Crabtree effect in yeast) causes cyclic
   * acetate production/consumption visible in base addition patterns.
   *
   * @param baseRateHistory Base consumption rate readings (mL/h), newest last
   */
  detectOverflow(baseRateHistory: number[]): OverflowResult {
    if (baseRateHistory.length < 6) {
      return { detected: false, severity: 0 };
    }

    // Count sign changes in the first derivative
    let signChanges = 0;
    for (let i = 2; i < baseRateHistory.length; i++) {
      const prevDelta = baseRateHistory[i - 1] - baseRateHistory[i - 2];
      const currDelta = baseRateHistory[i] - baseRateHistory[i - 1];

      if ((prevDelta > 0 && currDelta < 0) || (prevDelta < 0 && currDelta > 0)) {
        signChanges++;
      }
    }

    // Severity: ratio of sign changes to maximum possible
    const maxChanges = baseRateHistory.length - 2;
    const severity = maxChanges > 0 ? signChanges / maxChanges : 0;

    // Overflow detected if >40% of transitions are oscillatory
    return {
      detected: severity > 0.4,
      severity: Math.round(severity * 1000) / 1000,
    };
  }

  /**
   * Detect end of log (exponential) phase: growth rate (mu) starts declining.
   * Identifies the point where mu peaks and begins a sustained decrease.
   *
   * @param muHistory Specific growth rate readings (1/h), newest last
   */
  detectLogEnd(muHistory: number[]): LogEndResult {
    if (muHistory.length < 5) {
      return { detected: false, peakMu: 0 };
    }

    // Find peak mu
    let peakMu = -Infinity;
    let peakIndex = 0;
    for (let i = 0; i < muHistory.length; i++) {
      if (muHistory[i] > peakMu) {
        peakMu = muHistory[i];
        peakIndex = i;
      }
    }

    // Need at least 3 points after the peak to confirm decline
    if (peakIndex >= muHistory.length - 3) {
      return { detected: false, peakMu: Math.round(peakMu * 1000) / 1000 };
    }

    // Check for sustained decline: at least 3 consecutive decreases after peak
    let declines = 0;
    for (let i = peakIndex + 1; i < muHistory.length; i++) {
      if (muHistory[i] < muHistory[i - 1]) {
        declines++;
      } else {
        declines = 0; // Reset on any increase
      }

      if (declines >= 3) {
        return {
          detected: true,
          peakMu: Math.round(peakMu * 1000) / 1000,
        };
      }
    }

    return {
      detected: false,
      peakMu: Math.round(peakMu * 1000) / 1000,
    };
  }
}
