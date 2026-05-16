import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn((tagId: string) => {
    if (tagId === 'F01.AI-0') return { value: 1, isStale: false, ageMs: 50 };
    if (tagId === 'F01.AI-1') return { value: 50, isStale: false, ageMs: 50 };
    if (tagId === 'F01.AI-2') return { value: 0, isStale: false, ageMs: 50 };
    return { value: null, isStale: true, ageMs: 9999 };
  }),
}));

import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

describe('SvgWidgetInstance with animations', () => {
  it('applies rotate animation to outer g transform', () => {
    const item: SvgWidgetItem = {
      id: 'r1', type: 'svg-rect', x: 10, y: 20, w: 100, h: 80,
      animations: [{
        type: 'rotate',
        tag: 'F01.AI-1',
        rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const g = container.querySelector('g');
    expect(g?.getAttribute('transform')).toContain('translate(10,20)');
    expect(g?.getAttribute('transform')).toContain('rotate(180,50,40)');
  });

  it('applies color animation by overriding widget config.fillColor', () => {
    const item: SvgWidgetItem = {
      id: 'l1', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
      animations: [{
        type: 'color',
        tag: 'F01.AI-0',
        rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#000' },
        configKey: 'onColor',
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#abc');
  });

  it('hides widget when visibility animation evaluates false', () => {
    const item: SvgWidgetItem = {
      id: 'r2', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50,
      animations: [{
        type: 'visibility',
        tag: 'F01.AI-2',
        rule: { kind: 'discreteMap', map: { '0': false, '1': true }, default: true },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('rect')).toBeNull();
  });

  it('combines rotate + color in the same widget', () => {
    const item: SvgWidgetItem = {
      id: 'l2', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
      animations: [
        {
          type: 'rotate',
          tag: 'F01.AI-1',
          rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 90 },
        },
        {
          type: 'color',
          tag: 'F01.AI-0',
          rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#999' },
          configKey: 'onColor',
        },
      ],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const outer = container.querySelector('g');
    expect(outer?.getAttribute('transform')).toContain('rotate(45,20,20)');
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#0f0');
  });

  it('renders unchanged when animations field is absent', () => {
    const item: SvgWidgetItem = {
      id: 'l3', type: 'svg-lamp', x: 0, y: 0, w: 40, h: 40,
      bindings: { tag: 'F01.AI-0' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('layers animation rotate on top of static rotation', () => {
    const item: SvgWidgetItem = {
      id: 'r3', type: 'svg-rect', x: 5, y: 5, w: 60, h: 60, rotation: 30,
      animations: [{
        type: 'rotate',
        tag: 'F01.AI-1',
        rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 90 },
      }],
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const tx = container.querySelector('g')?.getAttribute('transform') ?? '';
    expect(tx).toContain('translate(5,5)');
    expect(tx).toContain('rotate(30,30,30)');
    expect(tx).toContain('rotate(45,30,30)');
  });
});
