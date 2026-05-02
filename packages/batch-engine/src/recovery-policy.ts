// ============================================================
// RecoveryPolicy — boot-time orphan-batch handling strategy.
// ============================================================
// v1.9.0 P2 bucket 2 introduces this layer to decouple the *decision*
// (auto-resume / hold / abort) from the *action* (server-side scan +
// marking). Default policy preserves v1.7.2 behavior: always hold,
// never auto-resume. Customers can plug in more aggressive policies
// once F2-AUTO (engine restart on auto_resume) lands.
// ============================================================

export type RecoveryDecision = 'auto_resume' | 'hold' | 'abort';

export interface RecoveryDecisionInput {
  /** Persisted batch state at boot. */
  prevState: 'running' | 'held' | 'paused';
  /** Phase type if known (from recipe lookup); undefined when recipe missing. */
  phaseType?: string;
  /**
   * Milliseconds between the most recent audit_log row for this batch and now.
   * Proxy for "how long was the previous engine dead?". Larger = more dangerous to auto-resume.
   * undefined when no audit history exists (treat as "ancient" / dangerous).
   */
  ageSinceLastAuditMs?: number;
  /** Whether the corresponding reactor's PLC link is currently healthy. */
  commHealthy: boolean;
}

export interface RecoveryPolicy {
  decide(input: RecoveryDecisionInput): RecoveryDecision;
}

/**
 * Always-hold default — preserves v1.7.2 behavior. Operator must explicitly resume.
 */
export const defaultRecoveryPolicy: RecoveryPolicy = {
  decide: () => 'hold',
};

/**
 * Conservative short-outage policy. **Not enabled by default.** Returns auto_resume only when:
 *   - prevState === 'running' (operator hadn't paused)
 *   - ageSinceLastAuditMs is known and < 30_000 (gap < 30s — short crash)
 *   - commHealthy is true (PLC reachable now)
 *   - phaseType is NOT a hazardous one (no sterilization, no cooling — those need eyes)
 * Otherwise hold. Never returns abort (that's a future, more aggressive policy).
 */
export const conservativeShortOutagePolicy: RecoveryPolicy = {
  decide(input) {
    if (input.prevState !== 'running') return 'hold';
    if (!input.commHealthy) return 'hold';
    if (input.ageSinceLastAuditMs == null || input.ageSinceLastAuditMs > 30_000) return 'hold';
    if (input.phaseType === 'sterilization' || input.phaseType === 'cooling') return 'hold';
    return 'auto_resume';
  },
};
