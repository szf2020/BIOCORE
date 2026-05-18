import { describe, it, expect, beforeEach } from 'vitest';
import { GaugeRegistry } from '../gauge-registry';
import type { GaugeMeta, GaugeBase, GaugeContext, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class StubGauge implements GaugeBase {
  onMount(_w: FuxaWidget, _ctx: GaugeContext): void {}
  onUnmount(): void {}
  onProcess(_v: GaugeValue): void {}
  onPropertyChange(_c: { key: string; value: unknown; nextWidget: FuxaWidget }): void {}
  onResize(_w: number, _h: number): void {}
}

const stubMeta: GaugeMeta = {
  widgetType: 'svg-ext-value',
  create: () => new StubGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};

describe('GaugeRegistry', () => {
  let registry: GaugeRegistry;
  beforeEach(() => { registry = new GaugeRegistry(); });

  it('register + create round-trip returns a GaugeBase instance', () => {
    registry.register(stubMeta);
    const gauge = registry.create({ id: 'w1', type: 'svg-ext-value', property: {} });
    expect(gauge).not.toBeNull();
    expect(typeof gauge!.onMount).toBe('function');
  });

  it('register duplicate type throws with type name in message', () => {
    registry.register(stubMeta);
    expect(() => registry.register(stubMeta))
      .toThrow("gauge already registered for type 'svg-ext-value'");
  });

  it('create for unknown type returns null', () => {
    expect(registry.create({ id: 'w1', type: 'unknown-type', property: {} })).toBeNull();
  });
});
