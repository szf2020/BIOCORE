// ============================================================
// page.test.tsx — Analytics dashboard page TDD RED → GREEN (SP-FX-43)
// ============================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Page from '../page';

// ── Mock useAuth ──────────────────────────────────────────────
const mockAdminUser = {
  user_id: 'u1', username: 'admin', display_name: 'Admin', role: 'admin' as const,
};
const authMock = { user: mockAdminUser, loading: false, login: vi.fn(), logout: vi.fn() };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authMock,
}));

// ── Mock fetch ────────────────────────────────────────────────
const mockViewUsage = {
  range: '7d',
  data: [{ view_id: 'v1', access_count: 42 }, { view_id: 'v2', access_count: 10 }],
};
const mockWidgetTypes = {
  range: '7d',
  data: [{ type: 'gauge', count: 15 }, { type: 'label', count: 8 }],
};
const mockUserActivity = {
  range: '7d',
  dau: [{ day: '2026-05-18', dau: 5 }],
  wau: [{ week: '2026-20', wau: 8 }],
};
const mockWriteIntent = {
  range: '7d',
  accept_count: 10,
  reject_count: 3,
  accept_rate: 0.769,
  reject_reasons: [{ reason: '参数超限', count: 3 }],
};

const API_RESPONSES: Record<string, unknown> = {
  'view-usage': mockViewUsage,
  'widget-types': mockWidgetTypes,
  'user-activity': mockUserActivity,
  'write-intent-stats': mockWriteIntent,
};

function setupFetch() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const key = Object.keys(API_RESPONSES).find(k => url.includes(k));
    const data = key ? API_RESPONSES[key] : {};
    return Promise.resolve({
      ok: true,
      json: async () => data,
    } as any);
  });
}

beforeEach(() => {
  authMock.user = mockAdminUser;
  vi.clearAllMocks();
  setupFetch();
});

// ── 访问控制 ──────────────────────────────────────────────────

describe('访问控制', () => {
  it('T1: 非 admin 显示无权访问提示', async () => {
    authMock.user = { ...mockAdminUser, role: 'operator' as any };
    await act(async () => { render(<Page />); });
    expect(screen.getByText(/无权访问/)).toBeTruthy();
  });

  it('T2: admin 用户不显示无权访问提示', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.queryByText(/无权访问/)).toBeNull();
  });
});

// ── 页面结构 ──────────────────────────────────────────────────

describe('页面结构', () => {
  it('T3: 页面标题存在', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText(/Analytics|分析仪表盘|使用统计/i)).toBeTruthy();
  });

  it('T4: 4 个 panel 标题都存在', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText(/View Usage|画面访问/i)).toBeTruthy();
    expect(screen.getByText(/Widget Types|组件类型/i)).toBeTruthy();
    expect(screen.getByText(/User Activity|用户活跃/i)).toBeTruthy();
    expect(screen.getByText(/Write.Intent|写入建议/i)).toBeTruthy();
  });

  it('T5: date range picker 存在', async () => {
    await act(async () => { render(<Page />); });
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });
});

// ── View Usage panel ──────────────────────────────────────────

describe('View Usage panel', () => {
  it('T6: 显示 view_id + access_count 数据', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });
});

// ── Write-Intent Stats panel ──────────────────────────────────

describe('Write-Intent Stats panel', () => {
  it('T7: 显示 accept/reject 数量', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Range picker 交互 ─────────────────────────────────────────

describe('date range picker 交互', () => {
  it('T8: 切换 range 触发重新 fetch', async () => {
    await act(async () => { render(<Page />); });
    const select = screen.getAllByRole('combobox')[0];
    const initialCalls = (global.fetch as any).mock.calls.length;
    await act(async () => {
      fireEvent.change(select, { target: { value: '30d' } });
    });
    expect((global.fetch as any).mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('T9: range 选项包含 7d / 30d / 90d', async () => {
    await act(async () => { render(<Page />); });
    const select = screen.getAllByRole('combobox')[0];
    const options = Array.from(select.querySelectorAll('option')).map((o: any) => o.value);
    expect(options).toContain('7d');
    expect(options).toContain('30d');
    expect(options).toContain('90d');
  });
});

// ── User Activity panel ───────────────────────────────────────

describe('User Activity panel', () => {
  it('T10: 显示 DAU 相关文本', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText(/DAU|日活/i)).toBeTruthy();
  });
});
