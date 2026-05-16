import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { SelectableWidget } from '../SelectableWidget';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgWidgetItem } from '@/widgets/svg/types';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

function firePointerDown(element: Element, options: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
  }) as any;
  event.pointerId = 1; // Add pointer-specific property
  act(() => {
    element.dispatchEvent(event);
  });
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
  useEditorStore.getState().__resetForTests(createEmptyView());
});

const baseItem: SvgWidgetItem = {
  id: 'w1',
  type: 'svg-rect',
  x: 10,
  y: 20,
  w: 100,
  h: 50,
};

describe('SelectableWidget', () => {
  it('pointer-down with no modifiers replaces selection', () => {
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    firePointerDown(wrap);
    expect([...useEditorStore.getState().selectedIds]).toEqual(['w1']);
  });

  it('shift+pointer-down toggles selection', () => {
    useEditorStore.getState().select(['w1'], 'replace');
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    firePointerDown(wrap, { shiftKey: true });
    expect(useEditorStore.getState().selectedIds.has('w1')).toBe(false);
  });

  it('ctrl+pointer-down adds to selection', () => {
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    firePointerDown(wrap, { ctrlKey: true });
    expect([...useEditorStore.getState().selectedIds].sort()).toEqual(['a', 'w1']);
  });

  it('does not allow animation fillColor override when previewAnimations=false', () => {
    const item: SvgWidgetItem = {
      ...baseItem,
      animations: [{
        type: 'color',
        tag: 'F01.AI-0',
        rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#fff' },
        configKey: 'fillColor',
      }],
    };
    const { container } = renderInSvg(<SelectableWidget instance={item} reactorId="F01" />);
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).not.toBe('#abc');
  });

  it('pointer-down stops propagation to parent', () => {
    const onCanvasDown = vi.fn();
    const { container } = render(
      <svg onPointerDown={onCanvasDown}>
        <SelectableWidget instance={baseItem} reactorId="F01" />
      </svg>,
    );
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    firePointerDown(wrap);
    expect(onCanvasDown).not.toHaveBeenCalled();
  });
});
