import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PropertiesPlaceholder } from '../PropertiesPlaceholder';
import { useEditorStore } from '../../../services/editor-store';

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

describe('PropertiesPlaceholder (SP-FX-4)', () => {
  beforeEach(() => { reset(); });

  it('renders "未选中" when selection is empty', () => {
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('未选中');
  });

  it('renders 7 readonly fields when 1 widget selected', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 10, y: 20, w: 100, h: 60, rotate: 30 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    const txt = container.textContent ?? '';
    expect(txt).toContain('w1');     // id
    expect(txt).toContain('rect');   // type
    expect(txt).toContain('10');     // x
    expect(txt).toContain('20');     // y
    expect(txt).toContain('100');    // w
    expect(txt).toContain('60');     // h
    expect(txt).toContain('30');     // rotate
  });

  it('rotate undefined renders "0"', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 50 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    const rotateRow = container.querySelector('[data-field="rotate"]');
    expect(rotateRow?.textContent).toContain('0');
  });

  it('renders "组件已删" when selection has id not in items', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: {}, schemaVersion: 1,
    } as any);
    // Bypass setSelection's items-validation by direct setState
    useEditorStore.setState({ selection: ['w_missing'] });
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('组件已删');
  });

  it('renders "已选 N (批量)" when 2+ widgets selected', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: {
        w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30 },
        w2: { id: 'w2', type: 'rect', property: {}, x: 60, y: 0, w: 50, h: 30 },
      },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1', 'w2']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('已选 2');
  });

  it('type field shows ellipse for ellipse widget', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { e1: { id: 'e1', type: 'ellipse', property: {}, x: 0, y: 0, w: 80, h: 80 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['e1']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.querySelector('[data-field="type"]')?.textContent).toContain('ellipse');
  });

  it('rotate=45 renders as "45"', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30, rotate: 45 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.querySelector('[data-field="rotate"]')?.textContent).toContain('45');
  });
});
