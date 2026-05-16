import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SvgEditorCanvas } from '../SvgEditorCanvas';
import { useEditorStore } from '../useEditorStore';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 0, y = 0, w = 50, h = 50): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

describe('SvgEditorCanvas — rubber-band selection', () => {
  it('pointer-down on empty area starts rubber band', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 100, 100)] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(useEditorStore.getState().gesture?.type).toBe('rubberband');
  });

  it('pointer-move during rubber band updates the rectangle', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 100, 100)] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 70, clientY: 80 });
    const rect = useEditorStore.getState().gesture?.rubberRect;
    expect(rect).toBeDefined();
    expect(rect!.w).toBeGreaterThan(0);
    expect(rect!.h).toBeGreaterThan(0);
  });

  it('pointer-up selects widgets intersecting the rubber band', () => {
    const view: SvgViewJson = {
      width: 800,
      height: 600,
      items: [mkItem('inside', 50, 50, 40, 40), mkItem('outside', 300, 300, 40, 40)],
    };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    const sel = useEditorStore.getState().selectedIds;
    expect(sel.has('inside')).toBe(true);
    expect(sel.has('outside')).toBe(false);
  });
});
