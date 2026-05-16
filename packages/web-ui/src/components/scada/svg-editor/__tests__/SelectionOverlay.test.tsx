import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SelectionOverlay } from '../SelectionOverlay';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 10, y = 20, w = 100, h = 80): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests(createEmptyView());
});

describe('SelectionOverlay', () => {
  it('renders 8 resize handles + 1 rotation handle when one widget is selected', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    expect(container.querySelectorAll('[data-handle]').length).toBe(9);
  });

  it('renders nothing when no widget is selected', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = renderInSvg(<SelectionOverlay />);
    expect(container.querySelectorAll('[data-handle]').length).toBe(0);
  });

  it('rotation handle is positioned above top-center of bbox', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20, 100, 80)] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const rot = container.querySelector('[data-handle="rotation"]');
    expect(rot).not.toBeNull();
    const cx = Number(rot?.getAttribute('cx'));
    const cy = Number(rot?.getAttribute('cy'));
    expect(cx).toBeCloseTo(60, 0);
    expect(cy).toBeLessThan(20);
  });

  it('resize handle pointer-down initiates a resize gesture in the store', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const seHandle = container.querySelector('[data-handle="se"]') as SVGElement;
    fireEvent.pointerDown(seHandle, { pointerId: 1, clientX: 100, clientY: 100 });
    const gesture = useEditorStore.getState().gesture;
    expect(gesture?.type).toBe('resize');
    expect(gesture?.handle).toBe('se');
  });

  it('multi-select shows a single bbox spanning all selected widgets', () => {
    const view: SvgViewJson = {
      width: 800,
      height: 600,
      items: [mkItem('a', 0, 0, 50, 50), mkItem('b', 100, 100, 50, 50)],
    };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a', 'b'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const outline = container.querySelector('[data-testid="multi-bbox"]');
    expect(outline).not.toBeNull();
    expect(outline?.getAttribute('x')).toBe('0');
    expect(outline?.getAttribute('y')).toBe('0');
    expect(outline?.getAttribute('width')).toBe('150');
    expect(outline?.getAttribute('height')).toBe('150');
  });
});
