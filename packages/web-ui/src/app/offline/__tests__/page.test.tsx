/**
 * SP-FX-44: /offline page 单测
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfflinePage from '../page';

// ─── Mock lucide-react ───────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  WifiOff: () => <svg data-testid="wifi-off-icon" />,
  RefreshCw: () => <svg data-testid="refresh-icon" />,
  ExternalLink: () => <svg data-testid="external-link-icon" />,
}));

describe('OfflinePage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('渲染标题和重试按钮', () => {
    render(<OfflinePage />);
    expect(screen.getByText('您当前处于离线状态')).toBeDefined();
    expect(screen.getByTestId('retry-btn')).toBeDefined();
  });

  it('重试按钮点击 → window.location.reload()', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
      configurable: true,
    });

    render(<OfflinePage />);
    fireEvent.click(screen.getByTestId('retry-btn'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('无 cached views 时不显示列表', () => {
    render(<OfflinePage />);
    expect(screen.queryByTestId('cached-views-list')).toBeNull();
  });

  it('localStorage 有 cached views 时显示列表', async () => {
    localStorage.setItem(
      'biocore_cached_views',
      JSON.stringify([
        { id: 'view-001', name: '主视图' },
        { id: 'view-002', name: '搅拌视图' },
      ]),
    );

    const { findByTestId, findByText } = render(<OfflinePage />);
    const list = await findByTestId('cached-views-list');
    expect(list).toBeDefined();
    expect(await findByText('主视图')).toBeDefined();
    expect(await findByText('搅拌视图')).toBeDefined();
  });
});
