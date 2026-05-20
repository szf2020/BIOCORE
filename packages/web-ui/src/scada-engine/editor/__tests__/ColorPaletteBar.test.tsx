// SP-FX-FF.5 RED → GREEN tests for ColorPaletteBar.

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ColorPaletteBar, __PALETTE_COLORS, TRANSPARENT_VALUE } from '../ColorPaletteBar';
import { useEditorStore } from '../../services/editor-store';
import type { FuxaView } from '../../models/hmi';
import type { FuxaWidget } from '../../models/widget';

const makeView = (items: Record<string, FuxaWidget>): FuxaView => ({
  id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
  width: 800, height: 600, items, schemaVersion: 1,
} as FuxaView);

beforeEach(() => {
  useEditorStore.getState().closeView();
});

describe('ColorPaletteBar (SP-FX-FF.5)', () => {
  it('renders palette bar with zoom + X + many swatches', () => {
    const { container } = render(<ColorPaletteBar />);
    expect(container.querySelector('[data-panel="color-palette"]')).not.toBeNull();
    expect(container.querySelector('[data-color-zoom]')).not.toBeNull();
    expect(container.querySelector(`[data-color="${TRANSPARENT_VALUE}"]`)).not.toBeNull();
    const swatches = container.querySelectorAll('[data-color]');
    expect(swatches.length).toBe(1 + __PALETTE_COLORS.length);
  });

  it('click on a color swatch patches selected widget property with wide color set', () => {
    const w: FuxaWidget = { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 50 } as FuxaWidget;
    useEditorStore.getState().openView(makeView({ w1: w }));
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<ColorPaletteBar />);
    const target = container.querySelector('[data-color="#ef4444"]') as HTMLButtonElement;
    expect(target).not.toBeNull();
    fireEvent.click(target);
    const updated = useEditorStore.getState().currentView!.items.w1 as FuxaWidget;
    const p = updated.property as Record<string, unknown>;
    // SP-FX-FF.8: wide patch covers every designer color field gauges use
    for (const key of ['fill', 'color', 'stroke', 'bgColor', 'fillColor', 'borderColor', 'barColor', 'pipeColor', 'tintColor', 'bodyColor', 'defaultColor', 'lineColor']) {
      expect(p[key]).toBe('#ef4444');
    }
  });

  it('click X swatch sets transparent on selected widget', () => {
    const w: FuxaWidget = { id: 'w1', type: 'rect', property: { fill: '#000' }, x: 0, y: 0, w: 50, h: 50 } as FuxaWidget;
    useEditorStore.getState().openView(makeView({ w1: w }));
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<ColorPaletteBar />);
    const x = container.querySelector(`[data-color="${TRANSPARENT_VALUE}"]`) as HTMLButtonElement;
    fireEvent.click(x);
    const updated = useEditorStore.getState().currentView!.items.w1 as FuxaWidget;
    expect((updated.property as Record<string, unknown>).fill).toBe(TRANSPARENT_VALUE);
    expect((updated.property as Record<string, unknown>).color).toBe(TRANSPARENT_VALUE);
  });

  it('no selection → click no-op (no update)', () => {
    const w: FuxaWidget = { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 50 } as FuxaWidget;
    useEditorStore.getState().openView(makeView({ w1: w }));
    useEditorStore.getState().setSelection([]);
    const { container } = render(<ColorPaletteBar />);
    const target = container.querySelector('[data-color="#3b82f6"]') as HTMLButtonElement;
    fireEvent.click(target);
    const unchanged = useEditorStore.getState().currentView!.items.w1 as FuxaWidget;
    expect((unchanged.property as Record<string, unknown>).fill).toBeUndefined();
  });

  it('multi-select → all selected widgets get the color', () => {
    const w1: FuxaWidget = { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 50 } as FuxaWidget;
    const w2: FuxaWidget = { id: 'w2', type: 'rect', property: {}, x: 60, y: 0, w: 50, h: 50 } as FuxaWidget;
    useEditorStore.getState().openView(makeView({ w1, w2 }));
    useEditorStore.getState().setSelection(['w1', 'w2']);
    const { container } = render(<ColorPaletteBar />);
    const target = container.querySelector('[data-color="#22c55e"]') as HTMLButtonElement;
    fireEvent.click(target);
    const view = useEditorStore.getState().currentView!;
    expect(((view.items.w1 as FuxaWidget).property as Record<string, unknown>).fill).toBe('#22c55e');
    expect(((view.items.w2 as FuxaWidget).property as Record<string, unknown>).fill).toBe('#22c55e');
  });
});
