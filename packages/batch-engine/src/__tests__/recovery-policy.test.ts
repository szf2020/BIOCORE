// ============================================================
// v1.9.0 P2 bucket 2 — RecoveryPolicy unit tests.
//
// Verifies the strategy layer used by the boot-time orphan-batch
// scan. Default policy must remain "always hold" to preserve
// v1.7.2 safety semantics (operator must explicitly resume after
// any unattended outage). Conservative short-outage policy is
// opt-in and gated by multiple conditions.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  defaultRecoveryPolicy,
  conservativeShortOutagePolicy,
  type RecoveryPolicy,
  type RecoveryDecisionInput,
} from '../recovery-policy';

describe('defaultRecoveryPolicy', () => {
  const inputs: RecoveryDecisionInput[] = [
    { prevState: 'running', commHealthy: true, ageSinceLastAuditMs: 1_000, phaseType: 'fermentation' },
    { prevState: 'running', commHealthy: false, ageSinceLastAuditMs: 1_000 },
    { prevState: 'held', commHealthy: true },
    { prevState: 'paused', commHealthy: true, ageSinceLastAuditMs: 60_000 },
    { prevState: 'running', commHealthy: true, ageSinceLastAuditMs: undefined, phaseType: 'sterilization' },
    { prevState: 'running', commHealthy: true, ageSinceLastAuditMs: 0, phaseType: 'cooling' },
  ];

  it.each(inputs)('always returns "hold" regardless of input %#', (input) => {
    expect(defaultRecoveryPolicy.decide(input)).toBe('hold');
  });
});

describe('conservativeShortOutagePolicy', () => {
  // The "happy path" — every gate satisfied
  const goodInput: RecoveryDecisionInput = {
    prevState: 'running',
    commHealthy: true,
    ageSinceLastAuditMs: 5_000,
    phaseType: 'fermentation',
  };

  it('returns "auto_resume" when all conditions are met', () => {
    expect(conservativeShortOutagePolicy.decide(goodInput)).toBe('auto_resume');
  });

  it('returns "hold" when prevState !== running (held)', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, prevState: 'held' })).toBe('hold');
  });

  it('returns "hold" when prevState !== running (paused)', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, prevState: 'paused' })).toBe('hold');
  });

  it('returns "hold" when commHealthy is false', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, commHealthy: false })).toBe('hold');
  });

  it('returns "hold" when ageSinceLastAuditMs is missing (undefined)', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, ageSinceLastAuditMs: undefined })).toBe('hold');
  });

  it('returns "hold" when ageSinceLastAuditMs > 30s threshold', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, ageSinceLastAuditMs: 30_001 })).toBe('hold');
  });

  it('returns "hold" for hazardous phaseType=sterilization', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, phaseType: 'sterilization' })).toBe('hold');
  });

  it('returns "hold" for hazardous phaseType=cooling', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, phaseType: 'cooling' })).toBe('hold');
  });

  it('returns "auto_resume" with phaseType undefined (only sterilization/cooling are hazardous)', () => {
    expect(conservativeShortOutagePolicy.decide({ ...goodInput, phaseType: undefined })).toBe('auto_resume');
  });

  it('never returns "abort" — that is reserved for a future, more aggressive policy', () => {
    const variants: RecoveryDecisionInput[] = [
      { prevState: 'running', commHealthy: true, ageSinceLastAuditMs: 1_000, phaseType: 'heating' },
      { prevState: 'held', commHealthy: false, ageSinceLastAuditMs: 999_999 },
      { prevState: 'paused', commHealthy: true },
      { prevState: 'running', commHealthy: false, phaseType: 'sterilization' },
    ];
    for (const v of variants) {
      expect(conservativeShortOutagePolicy.decide(v)).not.toBe('abort');
    }
  });
});

describe('RecoveryPolicy interface is pluggable', () => {
  it('a custom policy can return any RecoveryDecision (sanity check)', () => {
    const abortAlways: RecoveryPolicy = { decide: () => 'abort' };
    expect(abortAlways.decide({ prevState: 'running', commHealthy: true })).toBe('abort');

    const resumeAlways: RecoveryPolicy = { decide: () => 'auto_resume' };
    expect(resumeAlways.decide({ prevState: 'held', commHealthy: false })).toBe('auto_resume');
  });
});
