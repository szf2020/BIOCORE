import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
