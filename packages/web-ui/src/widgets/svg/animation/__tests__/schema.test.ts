import { describe, it, expect } from 'vitest';
import { AnimationSchema } from '../types';

describe('AnimationSchema', () => {
  it('accepts a valid discreteMap color animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': '#f00', '1': '#0f0' }, default: '#000' },
      configKey: 'fillColor',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid thresholdRanges visibility animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'visibility',
      tag: 'F01.AI-1',
      rule: {
        kind: 'thresholdRanges',
        ranges: [{ min: 0, max: 50, value: true }, { min: 50, max: 100, value: false }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid linearScale rotate animation', () => {
    const result = AnimationSchema.safeParse({
      type: 'rotate',
      tag: 'F01.AI-2',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360, clamp: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown animation type', () => {
    const result = AnimationSchema.safeParse({
      type: 'flash',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': 'a' } },
    });
    expect(result.success).toBe(false);
  });
});
