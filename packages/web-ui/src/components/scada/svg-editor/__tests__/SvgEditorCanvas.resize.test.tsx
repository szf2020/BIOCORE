import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SvgEditorCanvas } from '../SvgEditorCanvas';
import { useEditorStore } from '../useEditorStore';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgWidgetItem } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

function rect(id: string, x: number, y: number, w: number, h: number): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

function fp(el: Element, type: string, init: PointerEventInit) {
  el.dispatchEvent(new (window as any).PointerEvent(type, { bubbles: true, ...init }));
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests({ width: 800, height: 600, items: [rect('a', 10, 10, 100, 80)] });
  useEditorStore.getState().select(['a'], 'replace');
});

describe('SvgEditorCanvas drag handlers', () => {
  it('SE-handle drag resizes the widget', () => {
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const seHandle = container.querySelector('[data-handle="se"]')!;
    fp(seHandle, 'pointerdown', { clientX: 110, clientY: 90, pointerId: 1 });
    const svg = container.querySelector('svg')!;
    fp(svg, 'pointermove', { clientX: 130, clientY: 110, pointerId: 1 });
    fp(svg, 'pointerup', { clientX: 130, clientY: 110, pointerId: 1 });
    const item = useEditorStore.getState().view.items[0];
    expect(item.w).toBe(120);
    expect(item.h).toBe(100);
    expect(useEditorStore.getState().gesture).toBeNull();
  });

  it('rotation-handle drag updates rotation', () => {
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const rotHandle = container.querySelector('[data-handle="rotation"]')!;
    // bbox center = (60, 50). startPoint at (60, -14). drag to (84, 50) — 90deg clockwise relative to center.
    fp(rotHandle, 'pointerdown', { clientX: 60, clientY: -14, pointerId: 1 });
    const svg = container.querySelector('svg')!;
    fp(svg, 'pointermove', { clientX: 84, clientY: 50, pointerId: 1 });
    fp(svg, 'pointerup', { clientX: 84, clientY: 50, pointerId: 1 });
    const item = useEditorStore.getState().view.items[0];
    expect(item.rotation).toBeGreaterThan(0); // rotated somewhere
    expect(useEditorStore.getState().gesture).toBeNull();
  });

  it('resize gesture ends correctly even with no movement', () => {
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const seHandle = container.querySelector('[data-handle="se"]')!;
    fp(seHandle, 'pointerdown', { clientX: 110, clientY: 90, pointerId: 1 });
    const svg = container.querySelector('svg')!;
    fp(svg, 'pointerup', { clientX: 110, clientY: 90, pointerId: 1 });
    expect(useEditorStore.getState().gesture).toBeNull();
  });
});
