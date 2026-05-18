import { describe, it, expect, vi } from 'vitest';
import type { GaugeBase, GaugeValue, GaugeContext, GaugeMeta } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class MinimalGauge implements GaugeBase {
  onMount(_widget: FuxaWidget, _ctx: GaugeContext): void {}
  onUnmount(): void {}
  onProcess(_value: GaugeValue): void {}
  onPropertyChange(_change: { key: string; value: unknown; nextWidget: FuxaWidget }): void {}
  onResize(_w: number, _h: number): void {}
}

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 42, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('GaugeBase interface', () => {
  it('implementor satisfies all 5 required hooks without onClick', () => {
    const g: GaugeBase = new MinimalGauge();
    expect(typeof g.onMount).toBe('function');
    expect(typeof g.onUnmount).toBe('function');
    expect(typeof g.onProcess).toBe('function');
    expect(typeof g.onPropertyChange).toBe('function');
    expect(typeof g.onResize).toBe('function');
    expect(g.onClick).toBeUndefined();
  });

  it('GaugeValue isStale=true with null value is valid shape', () => {
    const v: GaugeValue = { value: null, isStale: true };
    expect(v.isStale).toBe(true);
    expect(v.value).toBeNull();
  });

  it('GaugeContext.readValue is called synchronously and returns GaugeValue', () => {
    const ctx = makeCtx();
    const result = ctx.readValue('reactor1.AI-0');
    expect(result).toEqual({ value: 42, isStale: false });
    expect(ctx.readValue).toHaveBeenCalledWith('reactor1.AI-0');
  });

  it('onClick is optional — non-button widget can omit it', () => {
    const g: GaugeBase = new MinimalGauge();
    expect('onClick' in g).toBe(false);
  });

  it('onUnmount idempotent — calling twice does not throw', () => {
    const g = new MinimalGauge();
    expect(() => { g.onUnmount(); g.onUnmount(); }).not.toThrow();
  });
});
