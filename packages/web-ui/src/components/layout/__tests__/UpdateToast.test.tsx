/**
 * SP-FX-44: UpdateToast component 单测
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateToast } from '../UpdateToast';

// ─── Mock useServiceWorker ───────────────────────────────────────────────────
vi.mock('@/hooks/useServiceWorker', () => ({
  useServiceWorker: vi.fn(),
}));

import { useServiceWorker } from '@/hooks/useServiceWorker';

vi.mock('lucide-react', () => ({
  RefreshCw: () => <svg data-testid="refresh-icon" />,
}));

describe('UpdateToast', () => {
  it('updateReady=false 时不渲染 toast', () => {
    vi.mocked(useServiceWorker).mockReturnValue({ updateReady: false, skipWaiting: vi.fn() });
    render(<UpdateToast />);
    expect(screen.queryByTestId('update-toast')).toBeNull();
  });

  it('updateReady=true 时显示 toast', () => {
    vi.mocked(useServiceWorker).mockReturnValue({ updateReady: true, skipWaiting: vi.fn() });
    render(<UpdateToast />);
    expect(screen.getByTestId('update-toast')).toBeDefined();
    expect(screen.getByText('新版本可用')).toBeDefined();
  });

  it('点击"立即刷新"按钮调用 skipWaiting', () => {
    const skipWaiting = vi.fn();
    vi.mocked(useServiceWorker).mockReturnValue({ updateReady: true, skipWaiting });
    render(<UpdateToast />);
    fireEvent.click(screen.getByTestId('update-reload-btn'));
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
});
