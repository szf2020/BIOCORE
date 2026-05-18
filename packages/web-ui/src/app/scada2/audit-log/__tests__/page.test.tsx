// ============================================================
// page.test.tsx — audit-log page TDD RED → GREEN (SP-FX-19)
// ============================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Page from '../page';

// ── Mock useAuth ──────────────────────────────────────────
const mockUser = { user_id: 'u1', username: 'admin', display_name: 'Admin', role: 'admin' as const };
const authMock = { user: mockUser, loading: false, login: vi.fn(), logout: vi.fn() };

vi.mock('@/hooks/useAuth.tsx', () => ({
  useAuth: () => authMock,
}));

// ── Mock fetch ────────────────────────────────────────────
const mockRows = [
  { id: 1, user_id: 'alice', action: 'POST',   resource_type: 'batches', resource_id: '1', ip: '127.0.0.1', timestamp: '2026-05-18T00:00:00' },
  { id: 2, user_id: 'bob',   action: 'DELETE', resource_type: 'recipes', resource_id: '2', ip: '10.0.0.1',  timestamp: '2026-05-17T00:00:00' },
];

function setupFetch(rows = mockRows) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => rows,
  } as any);
}

beforeEach(() => {
  authMock.user = mockUser;
  vi.clearAllMocks();
  setupFetch();
});

describe('/scada2/audit-log page', () => {
  it('列表渲染 — 显示审计日志行', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
  });

  it('user filter 触发重新 fetch', async () => {
    await act(async () => { render(<Page />); });
    const input = screen.getByPlaceholderText(/用户ID/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'alice' } });
    });
    // fetch 应被调用至少 2 次 (初始 + filter)
    expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = (global.fetch as any).mock.calls.at(-1)[0] as string;
    expect(lastCall).toContain('userId=alice');
  });

  it('resource type filter 触发重新 fetch', async () => {
    await act(async () => { render(<Page />); });
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'batches' } });
    });
    expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = (global.fetch as any).mock.calls.at(-1)[0] as string;
    expect(lastCall).toContain('resourceType=batches');
  });

  it('分页 — 上下页按钮存在', async () => {
    await act(async () => { render(<Page />); });
    expect(screen.getByText('下一页')).toBeTruthy();
    expect(screen.getByText('上一页')).toBeTruthy();
  });

  it('admin 角色可访问 — 不显示无权提示', async () => {
    authMock.user = mockUser; // admin
    await act(async () => { render(<Page />); });
    expect(screen.queryByText('无权访问')).toBeNull();
  });

  it('非 admin 角色显示无权访问提示', async () => {
    authMock.user = { ...mockUser, role: 'operator' as any };
    await act(async () => { render(<Page />); });
    expect(screen.getByText('无权访问')).toBeTruthy();
  });
});
