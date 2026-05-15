import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks', () => ({
  useTag: vi.fn(() => ({ value: 75, isStale: false, ageMs: 100 })),
  useTagHistory: vi.fn(() => ({ points: [], isStale: false })),
}));

import { BoundWidget } from '../BoundWidget';
import * as hooks from '@/hooks';
import type { TankDef } from '../types';

describe('BoundWidget', () => {
  beforeEach(() => {
    vi.mocked(hooks.useTag).mockReturnValue({ value: 75, isStale: false, ageMs: 100 });
  });

  it('1. unknown widget.type → renders placeholder', () => {
    const widget = { id: 'x', type: 'unknown' as any, x: 0, y: 0, w: 50, h: 50, props: {} };
    const { container } = render(<BoundWidget widget={widget} />);
    expect(container.textContent).toContain('Unknown widget');
  });

  it('2. bindings=[] → defaultProps + widget.props merged, renders Tank', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#ff0000' },
    };
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]');
    expect(fillRect?.getAttribute('fill')).toBe('#ff0000');
  });

  it('3. binding without transform → useTag value passed to prop', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#3b82f6' },
      bindings: [{ tag: 'F01.AI-0', prop: 'fillPct' }],
    };
    vi.mocked(hooks.useTag).mockReturnValueOnce({ value: 75, isStale: false, ageMs: 100 });
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const h = Number(fillRect.getAttribute('height'));
    expect(h).toBeGreaterThan(100);
  });

  it('4. binding with transform → eval applied', () => {
    const widget: TankDef = {
      id: 'tank1', type: 'tank', x: 0, y: 0, w: 100, h: 200,
      props: { color: '#3b82f6' },
      bindings: [{ tag: 'F01.AI-0', prop: 'fillPct', transform: 'v > 50 ? 100 : 0' }],
    };
    vi.mocked(hooks.useTag).mockReturnValueOnce({ value: 75, isStale: false, ageMs: 100 });
    const { container } = render(<BoundWidget widget={widget} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const h = Number(fillRect.getAttribute('height'));
    expect(h).toBeGreaterThanOrEqual(160);
  });
});
