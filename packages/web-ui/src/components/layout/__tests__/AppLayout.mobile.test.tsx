// SP-FX-25: AppLayout mobile responsive tests
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), prefetch: vi.fn() }),
}));

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { username: 'admin', display_name: '管理员', role: 'admin' }, loading: false, logout: vi.fn() }),
}));

// Mock useRealtimeStore
vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: Object.assign(
    (selector: (s: any) => any) => selector({ wsConnected: true, stateUpdate: null, alarms: [], heartbeatStatus: null, heartbeatByReactor: {}, reactorData: {} }),
    { getState: () => ({ connect: vi.fn() }), subscribe: vi.fn(() => vi.fn()) },
  ),
}));

// Mock apiFetch
vi.mock('@/lib/auth', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
}));

// Mock useTheme
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ mode: 'system', cycle: vi.fn() }),
}));

import { AppLayout } from '../AppLayout';

describe('AppLayout mobile responsive (SP-FX-25)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
  });

  it('汉堡菜单按钮存在 (data-testid="hamburger-btn")', () => {
    const { getByTestId } = render(<AppLayout><div>内容</div></AppLayout>);
    expect(getByTestId('hamburger-btn')).toBeTruthy();
  });

  it('mobile 默认 sidebar 关闭状态下 nav 含 -translate-x-full', () => {
    const { getByTestId } = render(<AppLayout><div>内容</div></AppLayout>);
    const nav = getByTestId('sidebar-nav');
    expect(nav.className).toContain('-translate-x-full');
  });

  it('点击汉堡按钮展开 sidebar (sidebar-backdrop 出现)', () => {
    const { getByTestId } = render(<AppLayout><div>内容</div></AppLayout>);
    const btn = getByTestId('hamburger-btn');
    act(() => { fireEvent.click(btn); });
    expect(getByTestId('sidebar-backdrop')).toBeTruthy();
  });

  it('点击 backdrop 关闭 sidebar (backdrop 消失)', () => {
    const { getByTestId, queryByTestId } = render(<AppLayout><div>内容</div></AppLayout>);
    act(() => { fireEvent.click(getByTestId('hamburger-btn')); });
    act(() => { fireEvent.click(getByTestId('sidebar-backdrop')); });
    expect(queryByTestId('sidebar-backdrop')).toBeNull();
  });

  it('main content 区域存在 (data-testid="main-content")', () => {
    const { getByTestId } = render(<AppLayout><div>内容</div></AppLayout>);
    expect(getByTestId('main-content')).toBeTruthy();
  });
});
