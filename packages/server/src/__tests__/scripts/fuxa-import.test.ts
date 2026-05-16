import { describe, it, expect } from 'vitest';
import { convertFuxaView } from '../../scripts/fuxa-import';

describe('convertFuxaView', () => {
  it('maps profile.width/height/bkcolor to top-level SvgViewJson', () => {
    const fuxa = {
      id: 'v_test',
      name: 'Test',
      profile: { width: 800, height: 600, bkcolor: '#222', margin: 0 },
      items: {},
    };
    const r = convertFuxaView(fuxa);
    expect(r.view.width).toBe(800);
    expect(r.view.height).toBe(600);
    expect(r.view.background).toBe('#222');
    expect(r.view.items).toEqual([]);
  });

  it('drops # alpha channel from background', () => {
    const fuxa = {
      id: 'x',
      name: 'X',
      profile: { width: 100, height: 100, bkcolor: '#e7e7e7ff', margin: 0 },
      items: {},
    };
    expect(convertFuxaView(fuxa).view.background).toBe('#e7e7e7');
  });

  it('converts items Record to array with widget ids preserved', () => {
    const fuxa = {
      id: 'v',
      name: 'V',
      profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        b: { id: 'b', type: 'svg-ext-value', property: {}, name: 'b', label: 'L' },
      },
    };
    const r = convertFuxaView(fuxa);
    expect(r.view.items.map((it) => it.id).sort()).toEqual(['a', 'b']);
  });

  it('maps known fuxa types via registry; unknown types fall back to svg-rect', () => {
    const fuxa = {
      id: 'v',
      name: 'V',
      profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        u: { id: 'u', type: 'HXT_UnknownThing', property: {}, name: 'u', label: 'L' },
      },
    };
    const r = convertFuxaView(fuxa);
    expect(r.view.items.find((it) => it.id === 'a')!.type).toBe('svg-label');
    expect(r.view.items.find((it) => it.id === 'u')!.type).toBe('svg-rect');
    expect(r.report.unknownTypes).toContain('HXT_UnknownThing');
  });

  it('extracts variableId -> bindings.tag when present', () => {
    const fuxa = {
      id: 'v',
      name: 'V',
      profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: { variableId: 't_7e06_xyz' }, name: 'a', label: 'L' },
      },
    };
    expect(convertFuxaView(fuxa).view.items[0].bindings).toEqual({ tag: 't_7e06_xyz' });
  });

  it('assigns grid placement when no x/y/w/h available', () => {
    const fuxa = {
      id: 'v',
      name: 'V',
      profile: { width: 400, height: 400, bkcolor: '#fff', margin: 0 },
      items: {
        a: { id: 'a', type: 'svg-ext-value', property: {}, name: 'a', label: 'L' },
        b: { id: 'b', type: 'svg-ext-value', property: {}, name: 'b', label: 'L' },
        c: { id: 'c', type: 'svg-ext-value', property: {}, name: 'c', label: 'L' },
      },
    };
    const all = convertFuxaView(fuxa).view.items;
    expect(all.every((it) => typeof it.x === 'number' && typeof it.y === 'number' && it.w > 0 && it.h > 0)).toBe(true);
  });

  it('reports dropped multi-actions', () => {
    const fuxa = {
      id: 'v',
      name: 'V',
      profile: { width: 100, height: 100, bkcolor: '#fff', margin: 0 },
      items: {
        b: {
          id: 'b',
          type: 'svg-ext-value',
          name: 'b',
          label: 'L',
          property: {
            actions: [
              { type: 'write', tag: 't1', value: 1 },
              { type: 'navigate', view_id: 'v2' },
            ],
          },
        },
      },
    };
    const r = convertFuxaView(fuxa);
    expect(r.report.lossy.length).toBeGreaterThan(0);
    expect(r.report.lossy[0]).toMatch(/multi-action/);
  });
});
