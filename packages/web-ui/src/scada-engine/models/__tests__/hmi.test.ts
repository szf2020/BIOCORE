import { describe, it, expect } from 'vitest';
import {
  FuxaViewSchema,
  parseFuxaView,
  FUXA_SCHEMA_VERSION,
} from '../hmi';
import { defaultEmptyView } from '../view';
import {
  FuxaActionSchema,
  FuxaEventSchema,
  FuxaPropertySchema,
} from '../property';
import { FuxaWidgetSchema } from '../widget';
import {
  isMoveAction, isOpacityAction, isColorAction,
} from '../animation';

describe('FuxaViewSchema (SP-FX-1)', () => {
  it('accepts a minimal valid view', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse(v)).not.toThrow();
  });

  it('rejects width <= 0', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse({ ...v, width: 0 })).toThrow();
    expect(() => FuxaViewSchema.parse({ ...v, width: -10 })).toThrow();
  });

  it('rejects schemaVersion other than 1', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse({ ...v, schemaVersion: 2 })).toThrow();
  });

  it('accepts items with FuxaWidget shape including a property block', () => {
    const v = {
      ...defaultEmptyView('v1', 'My View'),
      items: {
        w1: {
          id: 'w1',
          type: 'svg-ext-value',
          name: 'Temperature reading',
          property: {
            variableId: 'Reactor-1/temperature',
            variableSrc: 'device',
            events: [
              { type: 'click', action: 'set-value', actparam: 'Reactor-1/sp_temperature' },
            ],
            actions: [
              { type: 'text', variableId: 'Reactor-1/temperature' },
            ],
            options: { decimals: 2 },
          },
        },
      },
    };
    const parsed = FuxaViewSchema.parse(v);
    expect(parsed.items.w1.property.variableId).toBe('Reactor-1/temperature');
    expect(parsed.items.w1.property.events?.[0].action).toBe('set-value');
  });

  it('parseFuxaView round-trips a JSON string', () => {
    const v = defaultEmptyView('v1', 'My View');
    const round = parseFuxaView(JSON.stringify(v));
    expect(round).toEqual(v);
  });

  it('parseFuxaView throws on bad JSON', () => {
    expect(() => parseFuxaView('{ not json')).toThrow();
  });

  it('FUXA_SCHEMA_VERSION is 1', () => {
    expect(FUXA_SCHEMA_VERSION).toBe(1);
  });
});

describe('FuxaEventSchema + FuxaActionSchema', () => {
  it('event action accepts the 5 supported values', () => {
    for (const action of ['open-view', 'close-view', 'set-value', 'navigate', 'run-script-skip']) {
      expect(() =>
        FuxaEventSchema.parse({ type: 'click', action, actparam: 'x' }),
      ).not.toThrow();
    }
  });

  it('event action rejects unknown', () => {
    expect(() =>
      FuxaEventSchema.parse({ type: 'click', action: 'run-script', actparam: 'x' }),
    ).toThrow();
  });

  it('action requires variableId', () => {
    expect(() =>
      FuxaActionSchema.parse({ type: 'visibility' } as any),
    ).toThrow();
  });

  it('FuxaEventSchema requireConfirm defaults to true when omitted', () => {
    const parsed = FuxaEventSchema.parse({
      type: 'click', action: 'set-value', actparam: 'F01.AO-0_cv',
    });
    expect(parsed.requireConfirm).toBe(true);
  });

  it('FuxaEventSchema requireConfirm honors explicit false', () => {
    const parsed = FuxaEventSchema.parse({
      type: 'click', action: 'set-value', actparam: 'F01.AO-0_cv', requireConfirm: false,
    });
    expect(parsed.requireConfirm).toBe(false);
  });
});

describe('FuxaProperty schema', () => {
  it('permits empty property (no bindings)', () => {
    expect(() => FuxaPropertySchema.parse({})).not.toThrow();
  });

  it('rejects non-integer permission', () => {
    expect(() => FuxaPropertySchema.parse({ permission: 1.5 })).toThrow();
  });
});

describe('animation discriminators', () => {
  it('isMoveAction narrows correctly', () => {
    const a = { type: 'move' as const, variableId: 'x' };
    const o = { type: 'opacity' as const, variableId: 'x' };
    expect(isMoveAction(a)).toBe(true);
    expect(isMoveAction(o)).toBe(false);
    expect(isOpacityAction(o)).toBe(true);
    expect(isColorAction(a)).toBe(false);
  });
});

describe('FuxaWidgetSchema (SP-FX-3a)', () => {
  it('FuxaWidgetSchema accepts optional x/y/w/h geometry fields', () => {
    const parsed = FuxaWidgetSchema.parse({
      id: 'w1', type: 'svg-ext-value', property: {},
      x: 100, y: 50, w: 80, h: 40,
    });
    expect(parsed.x).toBe(100);
    expect(parsed.y).toBe(50);
    expect(parsed.w).toBe(80);
    expect(parsed.h).toBe(40);
  });

  it('FuxaWidgetSchema parses widget without geometry (backward-compat)', () => {
    const parsed = FuxaWidgetSchema.parse({
      id: 'w1', type: 'svg-ext-value', property: {},
    });
    expect(parsed.x).toBeUndefined();
    expect(parsed.w).toBeUndefined();
  });
});
