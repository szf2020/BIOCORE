import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EditorCanvas } from '../EditorCanvas';
import { useEditorStore } from '../../services/editor-store';
import type { FuxaView, FuxaWidget } from '../../models';

function makeView(items: Record<string, FuxaWidget> = {}): FuxaView {
  return {
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

function makeWidget(id: string, x = 10, y = 10, w = 50, h = 30): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {}, x, y, w, h } as FuxaWidget;
}

beforeEach(() => {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  } as any, true);
});

describe('EditorCanvas (SP-FX-3a)', () => {
  it('renders "无视图" placeholder when currentView is null', () => {
    render(<EditorCanvas />);
    expect(screen.getByText(/无视图/)).toBeInTheDocument();
  });

  it('mounts canvas controller when currentView becomes set', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') }));
    });
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-layer="widgets"]')).not.toBeNull();
  });

  it('renders one rect per widget with geometry', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({
        w1: makeWidget('w1', 10, 10, 50, 30),
        w2: makeWidget('w2', 100, 100, 60, 40),
      }));
    });
    const widgets = container.querySelectorAll('[data-widget-id]');
    expect(widgets.length).toBe(2);
  });

  it('hides handles when selection is empty', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('shows handles when a widget is selected', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    act(() => { useEditorStore.getState().setSelection(['w1']); });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
  });

  it('updates handles when selected widget changes geometry', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({ w1: makeWidget('w1', 10, 10, 50, 30) }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 100, y: 100, w: 200, h: 100 } as any);
    });
    const selRect = container.querySelector('[data-overlay-part="selection-rect"]');
    expect(selRect?.getAttribute('width')).toBe('200');
  });

  it('switches canvas when view.id changes', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    expect(container.querySelectorAll('[data-widget-id]').length).toBe(1);
    act(() => {
      useEditorStore.getState().openView({ ...makeView({ w2: makeWidget('w2'), w3: makeWidget('w3', 50, 50) }), id: 'v2' });
    });
    const widgets = container.querySelectorAll('[data-widget-id]');
    expect(widgets.length).toBe(2);
  });

  it('unmount destroys canvas (no leftover svg)', () => {
    const { container, unmount } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    expect(container.querySelector('svg')).not.toBeNull();
    unmount();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('EditorCanvas keyboard handler (SP-FX-3b.1)', () => {
  function makeViewWithW1(): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 120, h: 80 } },
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, ...mods });
    document.dispatchEvent(event);
  }

  it('Ctrl+Z restores previous widget state', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().updateWidget('w1', { x: 100 });
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(100);
    act(() => { fireKey('z', { ctrlKey: true }); });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(50);
  });

  it('Ctrl+Y re-applies after undo', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().updateWidget('w1', { x: 100 });
      useEditorStore.getState().undo();
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(50);
    act(() => { fireKey('y', { ctrlKey: true }); });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(100);
  });

  it('ArrowRight with selection moves widget x+1 and pushes history', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const pastBefore = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(51);
    expect(useEditorStore.getState().history.past.length).toBe(pastBefore + 1);
  });

  it('Shift+ArrowRight moves widget x+10', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    act(() => { fireKey('ArrowRight', { shiftKey: true }); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(60);
  });

  it('keyboard handler skipped when activeElement is INPUT', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireKey('ArrowRight'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(50);  // unchanged — handler skipped
    document.body.removeChild(input);
  });

  it('snap-wire: setSnapEnabled toggles grid background', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeViewWithW1()); });
    expect(container.querySelector('[data-overlay="grid"]')).not.toBeNull();
    act(() => { useEditorStore.getState().setSnapEnabled(false); });
    expect(container.querySelector('[data-overlay="grid"]')).toBeNull();
    act(() => { useEditorStore.getState().setSnapEnabled(true); });
    expect(container.querySelector('[data-overlay="grid"]')).not.toBeNull();
  });
});

describe('EditorCanvas SP-FX-3b.2.1', () => {
  function makeViewWithItems(items: Record<string, FuxaWidget>): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items,
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; repeat?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, ...mods });
    document.dispatchEvent(event);
  }

  function fireKeyUp(key: string) {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  it('Ctrl+A selects all items in currentView', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 60, h: 40 } as any,
      }));
    });
    act(() => { fireKey('a', { ctrlKey: true }); });
    const sel = [...useEditorStore.getState().selection].sort();
    expect(sel).toEqual(['w1', 'w2']);
  });

  it('Ctrl+A while activeElement=INPUT does NOT trigger select-all', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireKey('a', { ctrlKey: true }); });
    expect(useEditorStore.getState().selection).toEqual([]);
    document.body.removeChild(input);
  });

  it('Delete key removes selected widgets', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => { fireKey('Delete'); });
    const items = useEditorStore.getState().currentView!.items;
    expect(Object.keys(items)).toEqual(['w2']);
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('Backspace key removes selected widgets', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => { fireKey('Backspace'); });
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual([]);
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('Delete with empty selection is a no-op', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
      useEditorStore.getState().setSelection([]);
    });
    act(() => { fireKey('Delete'); });
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
  });

  it('Delete while activeElement=INPUT does NOT remove widgets', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireKey('Delete'); });
    expect(Object.keys(useEditorStore.getState().currentView!.items)).toEqual(['w1']);
    document.body.removeChild(input);
  });

  it('Arrow with selection N>=2: all widgets move, 1 history entry', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const pastBefore = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    const w2 = useEditorStore.getState().currentView!.items.w2 as any;
    expect(w1.x).toBe(51);
    expect(w2.x).toBe(201);
    expect(useEditorStore.getState().history.past.length).toBe(pastBefore + 1);
  });

  it('Arrow nudge: first press +1 history; e.repeat=true: no push; new fresh press +1', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const past0 = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const past1 = useEditorStore.getState().history.past.length;
    expect(past1).toBe(past0 + 1);
    act(() => { fireKey('ArrowRight', { repeat: true }); });
    expect(useEditorStore.getState().history.past.length).toBe(past1);
    act(() => { fireKeyUp('ArrowRight'); });
    act(() => { fireKey('ArrowRight'); });
    expect(useEditorStore.getState().history.past.length).toBe(past1 + 1);
  });

  it('ESC tier 2: idle + selection non-empty → setSelection([])', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => { fireKey('Escape'); });
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('ESC tier 3: idle + selection empty → no-op', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({}));
    });
    expect(useEditorStore.getState().selection).toEqual([]);
    expect(() => act(() => { fireKey('Escape'); })).not.toThrow();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('selection.length >= 2: handles render as bbox (corners visible)', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 50, h: 30 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    const visibleCorners = Array.from(corners).filter((c) => c.getAttribute('visibility') !== 'hidden');
    expect(visibleCorners.length).toBe(4);
  });

  it('setGridSize triggers canvas.setGridVisible repaint with new size', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    expect(container.querySelector('pattern[data-grid="10"]')).not.toBeNull();
    act(() => { useEditorStore.getState().setGridSize(20); });
    expect(container.querySelector('pattern[data-grid="20"]')).not.toBeNull();
    expect(container.querySelector('pattern[data-grid="10"]')).toBeNull();
  });

  it('rubber-band rect mounted in overlay layer with visibility hidden initially', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    const rb = container.querySelector('[data-overlay="rubber-band"]') as SVGRectElement;
    expect(rb).not.toBeNull();
    expect(rb.getAttribute('visibility')).toBe('hidden');
  });
});

describe('EditorCanvas rotate (SP-FX-3b.2.2)', () => {
  function makeViewWithItems(items: Record<string, FuxaWidget>): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items,
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('rotateTooltip mounted in overlay layer with visibility hidden', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60 } as any,
      }));
    });
    const tooltip = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.getAttribute('visibility')).toBe('hidden');
  });

  it('view loaded with widget.rotate=30 renders transform attr on widget node', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 30 } as any,
      }));
    });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
  });

  it('updateWidget rotate=undefined strips rotate from store (commitRotate(0) path)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
    });
    act(() => { useEditorStore.getState().updateWidget('w1', { rotate: undefined } as any); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w).toBe(false);
  });

  it('TransformHandles position stays at unrotated AABB even when widget.rotate is set', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 90 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('transform') ?? '').not.toContain('rotate');
  });

  it('selection useEffect with rotated widget: selectionRect at unrotated geom', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const selRect = container.querySelector('[data-overlay="transform"] rect:not([data-handle]):not([data-bbox-corner])') as SVGRectElement;
    expect(selRect).not.toBeNull();
    expect(selRect.getAttribute('x')).toBe('50');
    expect(selRect.getAttribute('y')).toBe('50');
  });

  it('ESC during idle with rotated widget selected does not change widget.rotate', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => { fireKey('Escape'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.rotate).toBe(45);
  });
});

describe('EditorCanvas multi-select group operations (SP-FX-3b.2.3)', () => {
  function makeViewWithItems(items: Record<string, FuxaWidget>): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items,
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('multi-select (2 widgets) bbox shows 8 resize + rotate handles visible', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const handles = container.querySelectorAll('[data-handle]');
    const visibleCount = Array.from(handles).filter((h) => h.getAttribute('visibility') !== 'hidden').length;
    expect(visibleCount).toBe(9);
  });

  it('multi-select group-rotate: store widgets rotate field updates after commit', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 20, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 20, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 100, y: 100, w: 20, h: 20, rotate: 90 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { x: 200, y: 200, w: 20, h: 20, rotate: 90 } as any);
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).rotate).toBe(90);
    expect((useEditorStore.getState().currentView!.items.w2 as any).rotate).toBe(90);
  });

  it('multi-select group-rotate commit produces 1 history entry (silent batch)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 20, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 20, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const past0 = useEditorStore.getState().history.past.length;
    act(() => {
      useEditorStore.getState().updateWidget('w1', { rotate: 45 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { rotate: 45 } as any);
    });
    expect(useEditorStore.getState().history.past.length).toBe(past0 + 1);
  });

  it('multi-select group-resize SE: both widgets w/h scale via updateWidget batch', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 30, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 60, y: 50, w: 30, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 10, y: 10, w: 60, h: 40 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { x: 120, y: 90, w: 60, h: 40 } as any);
    });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    const w2 = useEditorStore.getState().currentView!.items.w2 as any;
    expect(w1.w).toBe(60);
    expect(w2.w).toBe(60);
    expect(w2.x).toBe(120);
  });

  it('single-select still uses single mode (4 bbox corners hidden, handles at widget box)', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
    const handles = container.querySelectorAll('[data-handle]');
    expect(handles.length).toBe(9);
  });

  it('multi-select with 2 rotated widgets renders both transform attrs', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60, rotate: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const el1 = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    const el2 = container.querySelector('[data-widget-id="w2"]') as SVGElement;
    expect(el1.getAttribute('transform')).toContain('rotate(30');
    expect(el2.getAttribute('transform')).toContain('rotate(45');
  });

  it('ESC clears selection in idle when 2 widgets selected (regression of 3b.2.1 Tier 2)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => { fireKey('Escape'); });
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('group operation commit strips rotate=0 in last entry (commitRotate(0) regression)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60, rotate: 30 } as any,
      }));
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { rotate: undefined } as any);
    });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w1).toBe(false);
  });
});

describe('EditorCanvas drop wire (SP-FX-4)', () => {
  beforeEach(() => {
    useEditorStore.getState().setGridSize(10);
  });

  function makeDragEvent(type: string, paletteType?: string, extra?: { clientX?: number; clientY?: number }) {
    const dataStore: Record<string, string> = {};
    if (paletteType !== undefined) dataStore['palette-item'] = paletteType;
    else dataStore['text/plain'] = 'hello';
    const fakeDataTransfer = {
      types: Object.keys(dataStore),
      getData: (key: string) => dataStore[key] ?? '',
    };
    const e = new Event(type, { bubbles: true, cancelable: true }) as any;
    Object.defineProperty(e, 'dataTransfer', { value: fakeDataTransfer });
    if (extra?.clientX !== undefined) Object.defineProperty(e, 'clientX', { value: extra.clientX });
    if (extra?.clientY !== undefined) Object.defineProperty(e, 'clientY', { value: extra.clientY });
    return e as DragEvent;
  }

  it('onDragOver with palette-item type calls preventDefault', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    expect(host).not.toBeNull();
    const e = makeDragEvent('dragover', 'rect');
    const prevented = !host.dispatchEvent(e);
    expect(prevented).toBe(true);
  });

  it('onDragOver without palette-item does NOT preventDefault', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const e = makeDragEvent('dragover');
    const prevented = !host.dispatchEvent(e);
    expect(prevented).toBe(false);
  });

  it('onDrop with type=rect calls store.addWidget with snapped coords', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    fireEvent(host, makeDragEvent('drop', 'rect', { clientX: 23, clientY: 47 }));
    expect(addSpy).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const widget = addSpy.mock.calls[0][0] as any;
    expect(widget.type).toBe('rect');
    expect(widget.x % 10).toBe(0);
    expect(widget.y % 10).toBe(0);
    addSpy.mockRestore();
  });

  it('onDrop with non-palette dataTransfer is no-op', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    fireEvent(host, makeDragEvent('drop', undefined, { clientX: 23, clientY: 47 }));
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('onDrop uses widget.type=ellipse for palette ellipse drop', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    fireEvent(host, makeDragEvent('drop', 'ellipse', { clientX: 0, clientY: 0 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((addSpy.mock.calls[0][0] as any).type).toBe('ellipse');
    addSpy.mockRestore();
  });
});

// SP-FX-48.3: dragover must preventDefault for palette-gauge type, else drop
// never fires for 信号灯/进度条/开关/滑块/管道 widgets (SP-FX-27 batch 2).
describe('EditorCanvas gauge drop (SP-FX-48.3)', () => {
  it('onDragOver with palette-gauge type calls preventDefault', () => {
    render(<EditorCanvas />);
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const ev = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { types: ['palette-gauge'] } });
    host.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('onDrop with palette-gauge calls addWidget(type=svg-ext-gauge_semaphore)', () => {
    const addWidgetSpy = vi.fn();
    vi.spyOn(useEditorStore, 'getState').mockReturnValue({
      addWidget: addWidgetSpy,
      gridSize: 10,
      currentView: { items: {} },
      selection: [],
      snapEnabled: true,
    } as any);

    render(<EditorCanvas />);
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: 50 });
    Object.defineProperty(ev, 'clientY', { value: 50 });
    Object.defineProperty(ev, 'dataTransfer', {
      value: {
        types: ['palette-gauge'],
        getData: (k: string) => (k === 'palette-gauge' ? 'svg-ext-gauge_semaphore' : ''),
      },
    });
    host.dispatchEvent(ev);
    expect(addWidgetSpy).toHaveBeenCalled();
    const arg = addWidgetSpy.mock.calls[0][0];
    expect(arg.type).toBe('svg-ext-gauge_semaphore');
  });
});
