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

function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    clientX?: number;
    clientY?: number;
  } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  }) as any;
  event.pointerId = 1;
  act(() => {
    element.dispatchEvent(event);
  });
}

function firePointerDown(
  element: Element,
  options: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; clientX?: number; clientY?: number } = {},
) {
  firePointer(element, 'pointerdown', options);
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
  useEditorStore.getState().__resetForTests(createEmptyView());
  if (!('setPointerCapture' in Element.prototype)) {
    (Element.prototype as any).setPointerCapture = function () {};
    (Element.prototype as any).releasePointerCapture = function () {};
    (Element.prototype as any).hasPointerCapture = function () {
      return false;
    };
  }
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

  describe('body-drag', () => {
    it('pointer-move below threshold does NOT start a move gesture', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 2, clientY: 0 });
      expect(useEditorStore.getState().gesture).toBeNull();
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: baseItem.x, y: baseItem.y });
    });

    it('pointer-move above threshold starts a move gesture and translates the widget', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 20, clientY: 0 });
      const s = useEditorStore.getState();
      expect(s.gesture).not.toBeNull();
      expect(s.gesture?.type).toBe('move');
      expect(s.view.items[0]).toMatchObject({ x: baseItem.x + 20, y: baseItem.y });
    });

    it('pointer-down then pointer-up without movement selects without moving', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointerup', { clientX: 0, clientY: 0 });
      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect([...s.selectedIds]).toEqual(['w1']);
      expect(s.view.items[0]).toMatchObject({ x: baseItem.x, y: baseItem.y });
    });

    it('drag on a pre-selected group moves all selected widgets', () => {
      const itemA = baseItem;
      const itemB: SvgWidgetItem = { id: 'w2', type: 'svg-rect', x: 200, y: 200, w: 50, h: 50 };
      const view = { width: 800, height: 600, items: [itemA, itemB] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['w1', 'w2'], 'replace');
      const { container } = renderInSvg(<SelectableWidget instance={itemA} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 30, clientY: 30 });
      const s = useEditorStore.getState();
      expect(s.view.items.find((i) => i.id === 'w1')).toMatchObject({ x: itemA.x + 30, y: itemA.y + 30 });
      expect(s.view.items.find((i) => i.id === 'w2')).toMatchObject({ x: itemB.x + 30, y: itemB.y + 30 });
    });
  });
});
