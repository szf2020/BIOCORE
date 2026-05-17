// 50+ valid + 19 invalid expression samples. Used by:
// - expression-eval.test.ts (unit tests choose specific cases)
// - expression-eval.fuxa-fixtures.test.ts (Task 8 batch validation, R1 gate)

export interface ExprFixture {
  expr: string;
  vars?: Record<string, number | string | boolean>;
  expected?: unknown;
  label?: string;
}

export const VALID_EXPRESSIONS: ExprFixture[] = [
  // Arithmetic
  { expr: '1 + 1', expected: 2 },
  { expr: '2 * 3 - 4', expected: 2 },
  { expr: '10 / 4', expected: 2.5 },
  { expr: '10 % 3', expected: 1 },
  { expr: '(1 + 2) * 3', expected: 9 },
  { expr: '2 ^ 10', expected: 1024 },
  // Tags
  { expr: 'temperature', vars: { temperature: 37 }, expected: 37 },
  { expr: 'temp + 10', vars: { temp: 25 }, expected: 35 },
  { expr: 'a + b', vars: { a: 1, b: 2 }, expected: 3 },
  { expr: 'tag1 + tag2 / 100', vars: { tag1: 50, tag2: 200 }, expected: 52 },
  { expr: '(temp - 32) * 5 / 9', vars: { temp: 100 }, expected: 37.77777777777778 },
  { expr: 'flow_rate * 60', vars: { flow_rate: 10 }, expected: 600 },
  // Comparison
  { expr: 'value > 50', vars: { value: 60 }, expected: true },
  { expr: 'value > 50', vars: { value: 40 }, expected: false },
  { expr: 'a >= b', vars: { a: 5, b: 5 }, expected: true },
  { expr: 'a < b', vars: { a: 3, b: 4 }, expected: true },
  { expr: 'a == b', vars: { a: 7, b: 7 }, expected: true },
  { expr: 'a != b', vars: { a: 7, b: 8 }, expected: true },
  // Logical
  { expr: 'a and b', vars: { a: true, b: true }, expected: true },
  { expr: 'a or b', vars: { a: false, b: true }, expected: true },
  { expr: 'not a', vars: { a: false }, expected: true },
  { expr: '(temp > 30) and (temp < 80)', vars: { temp: 50 }, expected: true },
  { expr: '(temp < 30) or (temp > 80)', vars: { temp: 90 }, expected: true },
  // Ternary / IF
  { expr: 'IF(temp < 80, 1, 0)', vars: { temp: 50 }, expected: 1 },
  { expr: 'IF(temp < 80, 1, 0)', vars: { temp: 90 }, expected: 0 },
  { expr: 'IF(level > 50, "high", "low")', vars: { level: 60 }, expected: 'high' },
  { expr: 'temp > 50 ? 1 : 0', vars: { temp: 60 }, expected: 1 },
  // Math functions
  { expr: 'MIN(a, b)', vars: { a: 5, b: 3 }, expected: 3 },
  { expr: 'MAX(a, b)', vars: { a: 5, b: 3 }, expected: 5 },
  { expr: 'ABS(x)', vars: { x: -7 }, expected: 7 },
  { expr: 'ROUND(3.7)', expected: 4 },
  { expr: 'ROUND(3.14159, 2)', expected: 3.14 },
  { expr: 'MIN(a, b, c)', vars: { a: 5, b: 3, c: 1 }, expected: 1 },
  // Compound
  { expr: 'IF(MIN(a, b) > 10, "ok", "low")', vars: { a: 12, b: 15 }, expected: 'ok' },
  { expr: 'ABS(t1 - t2)', vars: { t1: 50, t2: 35 }, expected: 15 },
  { expr: 'ROUND((a + b) / 2)', vars: { a: 5, b: 8 }, expected: 7 },
  { expr: '(a + b + c) / 3', vars: { a: 10, b: 20, c: 30 }, expected: 20 },
  { expr: 'rate * elapsed_min', vars: { rate: 2, elapsed_min: 45 }, expected: 90 },
  // Constants
  { expr: '3.14159', expected: 3.14159 },
  { expr: '0', expected: 0 },
  { expr: '-1', expected: -1 },
  // Booleans as expressions
  { expr: 'true', expected: true },
  { expr: 'false', expected: false },
  // String selection via IF
  { expr: 'IF(state == 1, "ON", "OFF")', vars: { state: 1 }, expected: 'ON' },
  { expr: 'IF(state == 1, "ON", "OFF")', vars: { state: 0 }, expected: 'OFF' },
  // Nested IF
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 50 }, expected: 'warm' },
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 90 }, expected: 'hot' },
  { expr: 'IF(t < 30, "cold", IF(t < 80, "warm", "hot"))', vars: { t: 20 }, expected: 'cold' },
  // Unary
  { expr: '-temp', vars: { temp: 25 }, expected: -25 },
  // Multiple operators
  { expr: 'a + b - c', vars: { a: 10, b: 5, c: 3 }, expected: 12 },
  { expr: 'a * b + c * d', vars: { a: 2, b: 3, c: 4, d: 5 }, expected: 26 },
  { expr: 'a / b * 100', vars: { a: 1, b: 4 }, expected: 25 },
  // Edge numerics
  { expr: '0 * x', vars: { x: 999 }, expected: 0 },
  { expr: '1', expected: 1 },
];

export const INVALID_EXPRESSIONS: ExprFixture[] = [
  { expr: '', label: 'empty' },
  { expr: '   ', label: 'whitespace only' },
  { expr: 'a +', label: 'trailing operator' },
  { expr: '(a + b', label: 'unclosed paren' },
  { expr: 'a + b)', label: 'extra paren' },
  { expr: 'a..b', label: 'double dot' },
  { expr: 'a..b.c', label: 'invalid member' },
  { expr: 'obj.prop', label: 'member access (forbidden)', vars: { obj: { prop: 1 } as any } },
  { expr: 'console.log(1)', label: 'unsafe call' },
  { expr: 'eval("1")', label: 'eval call' },
  { expr: 'new Date()', label: 'constructor call' },
  { expr: '@invalid', label: 'illegal token' },
  { expr: 'a # b', label: 'illegal operator' },
  { expr: 'function(){return 1}', label: 'function definition' },
  { expr: 'a => b', label: 'arrow fn' },
  { expr: 'a, b', label: 'bare comma' },
  { expr: 'a +'.repeat(170), label: 'too long (>500 chars)' },
];
