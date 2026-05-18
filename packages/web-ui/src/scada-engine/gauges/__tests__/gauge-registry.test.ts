import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GaugeRegistry } from '../gauge-registry';
import type { GaugeMeta, GaugeBase, GaugeContext, GaugeValue, GaugeReplaceEvent } from '../gauge-base';
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

// SP-FX-17: versioning + replace + event tests
describe('GaugeRegistry — versioning + hot-swap (SP-FX-17)', () => {
  let registry: GaugeRegistry;

  const metaWithVersion: GaugeMeta = {
    widgetType: 'svg-ext-versioned',
    version: '2.0.0',
    create: () => new StubGauge(),
    getSignals: () => [],
  };

  const metaNoVersion: GaugeMeta = {
    widgetType: 'svg-ext-no-version',
    create: () => new StubGauge(),
    getSignals: () => [],
  };

  const metaV3: GaugeMeta = {
    widgetType: 'svg-ext-versioned',
    version: '3.0.0',
    create: () => new StubGauge(),
    getSignals: () => [],
  };

  beforeEach(() => { registry = new GaugeRegistry(); });

  it('register with version stores version', () => {
    registry.register(metaWithVersion);
    expect(registry.getVersion('svg-ext-versioned')).toBe('2.0.0');
  });

  it('getVersion returns stored version', () => {
    registry.register(metaWithVersion);
    expect(registry.getVersion('svg-ext-versioned')).toBe('2.0.0');
  });

  it('register without version defaults to 1.0.0', () => {
    registry.register(metaNoVersion);
    expect(registry.getVersion('svg-ext-no-version')).toBe('1.0.0');
  });

  it('register duplicate widgetType throws by default (replace:false)', () => {
    registry.register(metaWithVersion);
    expect(() => registry.register(metaV3))
      .toThrow("gauge already registered for type 'svg-ext-versioned'");
  });

  it('register with { replace: true } succeeds without throwing', () => {
    registry.register(metaWithVersion);
    expect(() => registry.register(metaV3, { replace: true })).not.toThrow();
    expect(registry.has('svg-ext-versioned')).toBe(true);
  });

  it('replace emits GaugeReplaceEvent with correct oldMeta, newMeta, widgetType, timestamp', () => {
    registry.register(metaWithVersion);
    const events: GaugeReplaceEvent[] = [];
    registry.onReplace((e) => events.push(e));
    const before = Date.now();
    registry.register(metaV3, { replace: true });
    const after = Date.now();

    expect(events).toHaveLength(1);
    expect(events[0].widgetType).toBe('svg-ext-versioned');
    expect(events[0].oldMeta.version).toBe('2.0.0');
    expect(events[0].newMeta.version).toBe('3.0.0');
    expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('onReplace subscribers receive replace event', () => {
    registry.register(metaWithVersion);
    const cb = vi.fn();
    registry.onReplace(cb);
    registry.register(metaV3, { replace: true });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('onReplace unsubscribe stops receiving events', () => {
    registry.register(metaWithVersion);
    const cb = vi.fn();
    const unsub = registry.onReplace(cb);
    unsub();
    registry.register(metaV3, { replace: true });
    expect(cb).not.toHaveBeenCalled();
  });
});
