// SP-FX-25: EditorShell mobile fallback tests
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
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

import { EditorShell } from '../editor-shell';

describe('EditorShell mobile fallback (SP-FX-25)', () => {
  beforeEach(() => {
    reset();
    openView();
  });

  it('windowWidth < 768 时显示 mobile warning (data-testid="editor-mobile-warning")', () => {
    const { getByTestId } = render(<EditorShell viewId="v1" windowWidth={375} />);
    expect(getByTestId('editor-mobile-warning')).toBeTruthy();
  });

  it('mobile warning 含提示文字 (>=768px)', () => {
    const { getByTestId } = render(<EditorShell viewId="v1" windowWidth={375} />);
    const warning = getByTestId('editor-mobile-warning');
    expect(warning.textContent).toContain('768px');
  });

  it('windowWidth >= 768 时正常渲染所有 panels (toolbar/palette/properties)', () => {
    const { container } = render(<EditorShell viewId="v1" windowWidth={1024} />);
    expect(container.querySelector('[data-panel="toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="palette"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="properties"]')).not.toBeNull();
  });

  it('mobile 时 EditorCanvas host 存在 (read-only preview)', () => {
    const { container } = render(<EditorShell viewId="v1" windowWidth={375} />);
    expect(container.querySelector('[data-editor-canvas-host]')).not.toBeNull();
  });
});
