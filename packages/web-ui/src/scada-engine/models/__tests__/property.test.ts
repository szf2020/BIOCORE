import { describe, it, expect } from 'vitest';
import { FuxaActionSchema } from '../property';

describe('FuxaActionSchema', () => {
  describe('conditionExpr / valueExpr', () => {
    it('accepts conditionExpr and valueExpr as optional strings (<=500 chars)', () => {
      const result = FuxaActionSchema.safeParse({
        type: 'color',
        variableId: 'TAG_01',
        conditionExpr: 'TAG_01 > 50',
        valueExpr: 'IF(TAG_01 > 80, "red", "green")',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conditionExpr).toBe('TAG_01 > 50');
        expect(result.data.valueExpr).toBe('IF(TAG_01 > 80, "red", "green")');
      }
    });

    it('rejects conditionExpr longer than 500 chars', () => {
      const longExpr = 'x'.repeat(501);
      const result = FuxaActionSchema.safeParse({
        type: 'color',
        variableId: 'TAG_01',
        conditionExpr: longExpr,
      });
      expect(result.success).toBe(false);
    });

    it('legacy FuxaAction without expressions still parses (backward compat)', () => {
      const result = FuxaActionSchema.safeParse({
        type: 'rotate',
        variableId: 'TAG_SPEED',
        range: { min: 0, max: 100 },
        output: { from: 0, to: 360 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conditionExpr).toBeUndefined();
        expect(result.data.valueExpr).toBeUndefined();
      }
    });
  });
});
