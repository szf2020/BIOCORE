import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorShell } from '../editor-shell';
import { useEditorStore } from '../../services/editor-store';

function reset() {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: true,
    gridSize: 10,
  } as any, true);
}

function openView() {
  useEditorStore.getState().openView({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items: {}, schemaVersion: 1,
  } as any);
}

describe('EditorShell (SP-FX-4)', () => {
  beforeEach(() => { reset(); openView(); });

  it('renders all 4 panels (toolbar/palette/properties + canvas host)', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    expect(container.querySelector('[data-panel="toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="palette"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="properties"]')).not.toBeNull();
    expect(container.querySelector('[data-editor-canvas-host]')).not.toBeNull();
  });

  it('palette has fixed-width class (w-[148px] after SP-FX-48.18 icon-grid)', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const palette = container.querySelector('[data-panel="palette"]')!;
    expect(palette.className).toContain('w-[148px]');
  });

  it('properties has width 250px class', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const props = container.querySelector('[data-panel="properties"]')!;
    expect(props.className).toContain('w-[250px]');
  });

  it('canvas host is nested inside a flex-1 wrapper (fills middle)', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const host = container.querySelector('[data-editor-canvas-host]')!;
    // SP-FX-FF.5: shell now wraps host + ColorPaletteBar; flex-1 layout is an
    // ancestor rather than the direct parent.
    expect(host.closest('.flex-1')).not.toBeNull();
  });

  it('forwards viewId to Toolbar (save button click triggers fetch with viewId)', async () => {
    const { container } = render(<EditorShell viewId="v_abc" />);
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await act(async () => {
      (container.querySelector('[data-cmd="save"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect((spy.mock.calls[0][0] as string)).toBe('/api/v1/fuxa-views/v_abc');
    spy.mockRestore();
  });

  it('re-render does not re-mount EditorCanvas (host element identity preserved)', () => {
    const { container, rerender } = render(<EditorShell viewId="v1" />);
    const host1 = container.querySelector('[data-editor-canvas-host]');
    rerender(<EditorShell viewId="v1" />);
    const host2 = container.querySelector('[data-editor-canvas-host]');
    expect(host1).toBe(host2);
  });
});
