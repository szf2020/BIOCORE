import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveAnimations, evalAnimations, type AnimationPatch } from '../animation-engine';
import type { FuxaWidget } from '../../models';

function makeWidget(
  id: string,
  actions: any[],
): FuxaWidget {
  return {
    id,
    type: 'svg-ext-value',
    x: 0, y: 0, w: 100, h: 40, rotate: 0, lock: false, hide: false,
    property: { variableId: 'TAG_01', actions },
    svgcontent: '',
  } as unknown as FuxaWidget;
}

describe('resolveAnimations', () => {
  it('collects tagIds from conditionExpr and valueExpr', () => {
    const w = makeWidget('w1', [
      {
        type: 'color',
        variableId: '',
        conditionExpr: 'TEMP > 80',
        valueExpr: 'IF(TEMP > 90, "red", "orange")',
      },
    ]);
    const resolved = resolveAnimations({ w1: w });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.tagIds).toContain('TEMP');
  });
});

describe('evalAnimations', () => {
  it('condition true -> patch emitted (color)', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'color' as const,
        variableId: '',
        conditionExpr: 'TEMP > 50',
        valueExpr: '"red"',
      },
      tagIds: ['TEMP'],
    }];
    const patches = evalAnimations(resolved, { TEMP: 80 });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ widgetId: 'w1', target: 'color', value: 'red' });
  });

  it('condition false -> no patch', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'color' as const,
        variableId: '',
        conditionExpr: 'TEMP > 50',
        valueExpr: '"red"',
      },
      tagIds: ['TEMP'],
    }];
    const patches = evalAnimations(resolved, { TEMP: 20 });
    expect(patches).toHaveLength(0);
  });

  it('multiple animations on one widget (color + visibility) -> both patches independent', () => {
    const resolved = [
      {
        widgetId: 'w1',
        action: {
          type: 'color' as const,
          variableId: '',
          conditionExpr: 'TEMP > 50',
          valueExpr: '"red"',
        },
        tagIds: ['TEMP'],
      },
      {
        widgetId: 'w1',
        action: {
          type: 'visibility' as const,
          variableId: '',
          conditionExpr: 'TEMP > 10',
        },
        tagIds: ['TEMP'],
      },
    ];
    const patches = evalAnimations(resolved, { TEMP: 80 });
    expect(patches).toHaveLength(2);
    expect(patches.map(p => p.target).sort()).toEqual(['color', 'visibility']);
  });

  it('parse error -> engine does not throw; other animations continue', () => {
    const resolved = [
      {
        widgetId: 'w1',
        action: {
          type: 'color' as const,
          variableId: '',
          conditionExpr: '###INVALID###',
          valueExpr: '"red"',
        },
        tagIds: [],
      },
      {
        widgetId: 'w2',
        action: {
          type: 'opacity' as const,
          variableId: '',
          conditionExpr: 'FLAG > 0',
          valueExpr: '0.5',
        },
        tagIds: ['FLAG'],
      },
    ];
    let patches: AnimationPatch[] = [];
    expect(() => {
      patches = evalAnimations(resolved, { FLAG: 1 });
    }).not.toThrow();
    expect(patches).toHaveLength(1);
    expect(patches[0]!.widgetId).toBe('w2');
  });

  it('legacy range/output (no conditionExpr) -> backward-compat patch generated', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'rotate' as const,
        variableId: 'SPEED',
        range: { min: 0, max: 100 },
        output: { from: 0, to: 360 },
      },
      tagIds: ['SPEED'],
    }];
    const patches = evalAnimations(resolved, { SPEED: 50 });
    expect(patches).toHaveLength(1);
    expect(patches[0]!.target).toBe('rotate');
    expect(patches[0]!.value).toBeCloseTo(180, 0);
  });
});

describe('animation-engine safety invariants (CI-greppable)', () => {
  it('contains no writeTag, sendWsMessage, eval(), new Function, fetch(), XMLHttpRequest', () => {
    const src = readFileSync(
      resolve(__dirname, '../animation-engine.ts'),
      'utf-8',
    );
    // Strip single-line comments before checking to avoid false positives from
    // SAFETY INVARIANT comment that names the banned APIs for documentation.
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    const BANNED = /writeTag|sendWsMessage|eval\(|new Function|fetch\(|XMLHttpRequest/;
    expect(BANNED.test(codeOnly)).toBe(false);
  });
});
