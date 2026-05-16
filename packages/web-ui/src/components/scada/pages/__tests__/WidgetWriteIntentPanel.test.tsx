import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { WidgetWriteIntentPanel } from '../WidgetWriteIntentPanel';

beforeEach(() => {
  useEditorStore.getState().__resetForTests({
    width: 800, height: 600,
    items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50 }],
  });
});

describe('WidgetWriteIntentPanel', () => {
  it('renders nothing when no widget selected', () => {
    const { container } = render(<WidgetWriteIntentPanel />);
    expect(container.querySelector('[data-testid="widget-write-intent-panel"]')).toBeNull();
  });

  it('typing tag writes writeIntent.tag to widget', async () => {
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const tagInput = screen.getByTestId('write-intent-tag-input') as HTMLInputElement;
    await act(async () => { fireEvent.change(tagInput, { target: { value: 'tank.fill' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill' });
  });

  it('typing value with number type writes numeric value', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill' } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const typeSel = screen.getByTestId('write-intent-value-type') as HTMLSelectElement;
    await act(async () => { fireEvent.change(typeSel, { target: { value: 'number' } }); });
    const valInput = screen.getByTestId('write-intent-value-input') as HTMLInputElement;
    await act(async () => { fireEvent.change(valInput, { target: { value: '42' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill', value: 42 });
  });

  it('boolean type stores boolean', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill' } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    const typeSel = screen.getByTestId('write-intent-value-type') as HTMLSelectElement;
    await act(async () => { fireEvent.change(typeSel, { target: { value: 'boolean' } }); });
    const valSel = screen.getByTestId('write-intent-value-bool') as HTMLSelectElement;
    await act(async () => { fireEvent.change(valSel, { target: { value: 'true' } }); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toEqual({ tag: 'tank.fill', value: true });
  });

  it('clear button removes writeIntent', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-button', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 'tank.fill', value: 1 } } as any],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetWriteIntentPanel />);
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-clear')); });
    const widget = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect((widget as any).writeIntent).toBeUndefined();
  });
});
