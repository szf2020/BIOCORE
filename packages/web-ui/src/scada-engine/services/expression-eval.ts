// SP-FX-2: read-only expression evaluator for SCADA gauge animations + actparam.
// Uses expr-eval with allowMemberAccess:false (prevents obj.prop / prototype pollution).
// Injects a small whitelist of safe functions (IF, MIN, MAX, ABS, ROUND).
// Caches parsed ASTs for 1Hz tick performance.
//
// SAFETY: this module has no reference to writeTag or any write API. It is
// the editor-time enforcement of the "auto/animation/expression never
// writes PLC" constraint.

import { Parser } from 'expr-eval';
import type { Expression } from 'expr-eval';

const parser = new Parser({
  operators: {
    logical: true,
    comparison: true,
    conditional: true,
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true,
  },
  allowMemberAccess: false,
});

const SAFE_FNS: Record<string, (...args: any[]) => any> = {
  IF: (cond: boolean, a: unknown, b: unknown) => (cond ? a : b),
  MIN: (...xs: number[]) => Math.min(...xs),
  MAX: (...xs: number[]) => Math.max(...xs),
  ABS: (x: number) => Math.abs(x),
  ROUND: (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d,
};
const SAFE_FN_NAMES = new Set(Object.keys(SAFE_FNS));

const MAX_EXPR_LENGTH = 500;
const parseCache = new Map<string, Expression | null>();

export function __clearParseCache(): void {
  parseCache.clear();
}

function parseOnce(expr: string): Expression | null {
  if (parseCache.has(expr)) return parseCache.get(expr) ?? null;
  let parsed: Expression | null = null;
  try {
    parsed = parser.parse(expr);
  } catch (e) {
    parsed = null;
    console.warn(`expression-eval: parse failed: ${expr}`, (e as Error).message);
  }
  parseCache.set(expr, parsed);
  return parsed;
}

export function evalExpression(
  expr: string,
  tagValues: Record<string, number | string | boolean>,
): unknown {
  if (!expr || expr.trim() === '') return undefined;
  if (expr.length > MAX_EXPR_LENGTH) {
    console.warn(`expression-eval: rejected expression >${MAX_EXPR_LENGTH} chars`);
    return undefined;
  }
  const parsed = parseOnce(expr);
  if (!parsed) return undefined;
  try {
    // Inject SAFE_FNS first, then tag values. For any variable referenced in
    // the expression but absent from tagValues, default to 0 so missing PLC
    // tags don't throw into React rerender.
    const allVars = parsed.variables();
    const defaults: Record<string, number> = {};
    for (const v of allVars) {
      if (!SAFE_FN_NAMES.has(v) && !(v in tagValues)) {
        defaults[v] = 0;
      }
    }
    return parsed.evaluate({ ...SAFE_FNS, ...defaults, ...tagValues });
  } catch (e) {
    console.warn(`expression-eval: evaluate failed: ${expr}`, (e as Error).message);
    return undefined;
  }
}

export function parseTagsFromExpression(expr: string): string[] {
  if (!expr || expr.trim() === '') return [];
  const parsed = parseOnce(expr);
  if (!parsed) return [];
  try {
    return parsed.variables().filter((v: string) => !SAFE_FN_NAMES.has(v));
  } catch {
    return [];
  }
}
