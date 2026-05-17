import { describe, it, expect } from 'vitest';
import { FuxaWidgetSchema } from '../widget';

describe('FuxaWidgetSchema rotate (SP-FX-3b.2.2)', () => {
  const base = { id: 'w1', type: 'svg-ext-value', property: {} };

  it('rotate=45 accepted', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 45 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rotate).toBe(45);
  });

  it('rotate=360 accepted (inclusive upper bound)', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 360 });
    expect(r.success).toBe(true);
  });

  it('rotate=-5 rejected', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: -5 });
    expect(r.success).toBe(false);
  });

  it('rotate=400 rejected', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 400 });
    expect(r.success).toBe(false);
  });
});
