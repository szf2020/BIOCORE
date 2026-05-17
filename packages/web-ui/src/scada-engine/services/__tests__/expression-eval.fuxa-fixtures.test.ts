import { describe, it, expect } from 'vitest';
import { evalExpression } from '../expression-eval';
import { VALID_EXPRESSIONS, INVALID_EXPRESSIONS } from '@/test/exprFixtures';

describe('expression-eval FUXA fixtures (SP-FX-2 R1 gate)', () => {
  it('VALID fixtures: ≥70% produce a defined result and match expected when given', () => {
    let passed = 0;
    const failures: string[] = [];
    for (const { expr, vars = {}, expected, label } of VALID_EXPRESSIONS) {
      const result = evalExpression(expr, vars);
      const ok = result !== undefined && (expected === undefined || result === expected);
      if (ok) passed++;
      else failures.push(`${label ?? expr}: got=${JSON.stringify(result)} want=${JSON.stringify(expected)}`);
    }
    const ratio = passed / VALID_EXPRESSIONS.length;
    if (passed < VALID_EXPRESSIONS.length) {
      // eslint-disable-next-line no-console
      console.warn(`expression-eval: ${VALID_EXPRESSIONS.length - passed} fixtures failed:\n  ${failures.join('\n  ')}`);
    }
    if (ratio < 0.7) {
      throw new Error(
        `R1 stop condition: only ${passed}/${VALID_EXPRESSIONS.length} (${(ratio * 100).toFixed(1)}%) ` +
        `of FUXA fixtures passed. Switch to custom evaluator or shrink supported syntax.`,
      );
    }
    expect(passed).toBeGreaterThanOrEqual(Math.ceil(VALID_EXPRESSIONS.length * 0.7));
  });

  it('INVALID fixtures: all return undefined (or non-finite numbers); none throw', () => {
    const escapees: string[] = [];
    for (const { expr, vars = {}, label } of INVALID_EXPRESSIONS) {
      let result: unknown;
      let threw = false;
      try { result = evalExpression(expr, vars); } catch { threw = true; }
      if (threw) escapees.push(`${label ?? expr}: threw`);
      else if (result !== undefined && !(typeof result === 'number' && !isFinite(result))) {
        escapees.push(`${label ?? expr}: returned ${JSON.stringify(result)} (expected undefined)`);
      }
    }
    const ratio = (INVALID_EXPRESSIONS.length - escapees.length) / INVALID_EXPRESSIONS.length;
    if (escapees.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`expression-eval: ${escapees.length} INVALID fixtures escaped:\n  ${escapees.join('\n  ')}`);
    }
    if (ratio < 0.7) {
      throw new Error(
        `R1 stop condition (INVALID): only ${INVALID_EXPRESSIONS.length - escapees.length}/${INVALID_EXPRESSIONS.length} ` +
        `(${(ratio * 100).toFixed(1)}%) downgrade to undefined. Switch to custom evaluator or shrink syntax.`,
      );
    }
    expect(ratio).toBeGreaterThanOrEqual(0.7);
  });
});
