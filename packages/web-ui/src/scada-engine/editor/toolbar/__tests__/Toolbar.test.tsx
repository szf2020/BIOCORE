import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Toolbar } from '../Toolbar';
import { useEditorStore } from '../../../services/editor-store';

function resetStore(snapEnabled = true) {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled,
    gridSize: 10,
  } as any, true);
}

function openMinimalView() {
  useEditorStore.getState().openView({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600,
    items: {},
    schemaVersion: 1,
  } as any);
}

describe('Toolbar (SP-FX-4)', () => {
  beforeEach(() => {
    resetStore();
    openMinimalView();
  });

  it('renders 4 buttons (save/undo/redo/grid)', () => {
    const { container } = render(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="save"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="undo"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="redo"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="grid"]')).not.toBeNull();
  });

  it('click 保存 calls store.saveView with viewId', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { container } = render(<Toolbar viewId="v1" />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-cmd="save"]')!);
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.calls[0][0] as string)).toBe('/api/v1/fuxa-views/v1');
    spy.mockRestore();
  });

  it('click 撤销 calls store.undo', () => {
    const spy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    // Force a history entry so undo button is enabled
    useEditorStore.setState((s) => ({ history: { past: [s.currentView as any], future: [] } }));
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="undo"]')!);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('click 重做 calls store.redo', () => {
    const spy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    useEditorStore.setState((s) => ({ history: { past: [], future: [s.currentView as any] } }));
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="redo"]')!);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('click 网格 calls store.toggleGrid', () => {
    const before = useEditorStore.getState().snapEnabled;
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="grid"]')!);
    expect(useEditorStore.getState().snapEnabled).toBe(!before);
  });

  it('grid button data-active reflects snapEnabled', () => {
    resetStore(true);
    openMinimalView();
    const { container, rerender } = render(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="grid"]')!.getAttribute('data-active')).toBe('true');
    act(() => { useEditorStore.getState().toggleGrid(); });
    rerender(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="grid"]')!.getAttribute('data-active')).toBe('false');
  });

  it('Cmd+S preventsDefault + calls saveView', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    render(<Toolbar viewId="v1" />);
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true });
    await act(async () => { document.dispatchEvent(e); await Promise.resolve(); });
    expect(e.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Cmd+Z calls store.undo; Cmd+Shift+Z calls store.redo', () => {
    const undoSpy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    const redoSpy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    render(<Toolbar viewId="v1" />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    expect(undoSpy).toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    expect(redoSpy).toHaveBeenCalled();
    undoSpy.mockRestore();
    redoSpy.mockRestore();
  });

  it('Cmd+Y also calls store.redo', () => {
    const redoSpy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    render(<Toolbar viewId="v1" />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', metaKey: true }));
    expect(redoSpy).toHaveBeenCalled();
    redoSpy.mockRestore();
  });

  it('Cmd+Z in INPUT focused element is skipped', () => {
    const undoSpy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    render(<Toolbar viewId="v1" />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    expect(undoSpy).not.toHaveBeenCalled();
    input.remove();
    undoSpy.mockRestore();
  });
});
