import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act, fireEvent } from '@testing-library/react';
import Page from '../page';
import { useEditorStore } from '@/scada-engine/services/editor-store';

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

describe('EditorShellPage (SP-FX-4)', () => {
  beforeEach(() => { reset(); });

  it('2xx loads view + renders EditorShell', async () => {
    const view = { id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600, items: {}, schemaVersion: 1 };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(view), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { container } = render(<Page params={{ viewId: 'v1' }} />);
    await waitFor(() => {
      expect(container.querySelector('[data-panel="toolbar"]')).not.toBeNull();
    });
    expect(spy).toHaveBeenCalledWith('/api/v1/fuxa-views/v1');
    spy.mockRestore();
  });

  it('404 renders "视图不存在" + 返回链接', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
    const { container } = render(<Page params={{ viewId: 'v_missing' }} />);
    await waitFor(() => {
      expect(container.textContent).toContain('视图不存在');
    });
    expect(container.querySelector('a[href="/scada2/"]')).not.toBeNull();
    spy.mockRestore();
  });

  it('5xx renders 重试 button; click re-fetches', async () => {
    let calls = 0;
    const spy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      calls += 1;
      return Promise.resolve(new Response('boom', { status: 500 }));
    });
    const { container } = render(<Page params={{ viewId: 'v1' }} />);
    await waitFor(() => {
      expect(container.textContent).toContain('加载失败');
    });
    expect(calls).toBe(1);
    await act(async () => {
      fireEvent.click(container.querySelector('button[data-action="retry"]')!);
      await Promise.resolve();
    });
    await waitFor(() => { expect(calls).toBe(2); });
    spy.mockRestore();
  });
});
