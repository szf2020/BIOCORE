// ============================================================
// backup/page.test.tsx — SP-FX-20 TDD RED-first
// ============================================================
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Page from '../page';

// ─── mock 基础依赖 ─────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/scada-engine/dialogs/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel, title }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button data-testid="confirm-ok" onClick={onConfirm}>确认</button>
        <button data-testid="confirm-cancel" onClick={onCancel}>取消</button>
      </div>
    ) : null,
}));

// 默认 admin user
const adminUser = { user_id: 'u1', username: 'admin', role: 'admin' as const };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: adminUser, loading: false, login: vi.fn(), logout: vi.fn() }),
}));

// 默认 backups 列表
const mockBackups = [
  { filename: 'biocore-20260518-060000.db.gz', size: 1234567, mtime: '2026-05-18T06:00:00.000Z' },
  { filename: 'biocore-20260517-060000.db.gz', size: 987654, mtime: '2026-05-17T06:00:00.000Z' },
];

// 全局 fetch mock
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  // 默认: GET /admin/backups 返回列表
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { backups: mockBackups } }),
  });
});

describe('/scada2/backup 页面 (SP-FX-20)', () => {
  it('渲染页面标题', async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/数据库备份与恢复/)).toBeTruthy();
    });
  });

  it('加载后渲染备份列表文件名', async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText('biocore-20260518-060000.db.gz')).toBeTruthy();
    });
  });

  it('admin 用户可见"立即备份"按钮', async () => {
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /立即备份/ })).toBeTruthy();
    });
  });

  it('admin 用户可见"下载"操作', async () => {
    render(<Page />);
    await waitFor(() => {
      const downloadLinks = screen.getAllByText(/下载/);
      expect(downloadLinks.length).toBeGreaterThan(0);
    });
  });

  it('"立即备份" 点击 → 调 POST /admin/backup', async () => {
    // 第一次 GET list, 第二次 POST backup, 第三次 refetch list
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { backups: mockBackups } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { filename: 'new.db.gz', size: 1, path: '' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { backups: mockBackups } }) });

    render(<Page />);
    await waitFor(() => screen.getByRole('button', { name: /立即备份/ }));
    fireEvent.click(screen.getByRole('button', { name: /立即备份/ }));
    await waitFor(() => {
      const calls: any[][] = fetchMock.mock.calls;
      const postCall = calls.find((c) => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(postCall![0]).toMatch(/admin\/backup/);
    });
  });

  it('"恢复"按钮打开确认 dialog', async () => {
    render(<Page />);
    await waitFor(() => screen.getAllByRole('button', { name: /^恢复$/ }));
    const restoreBtn = screen.getAllByRole('button', { name: /^恢复$/ })[0];
    fireEvent.click(restoreBtn);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    });
  });

  it('确认恢复 → 调 POST /admin/restore', async () => {
    // fetch mock 顺序: GET backups → GET download (含 blob) → POST restore → GET backups refetch
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { backups: mockBackups } }) })
      // download response 需要 .blob() 方法
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['fake'], { type: 'application/octet-stream' }), json: async () => ({}) })
      // POST restore response
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { message: '恢复成功' } }) })
      // refetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { backups: mockBackups } }) });

    render(<Page />);
    await waitFor(() => screen.getAllByRole('button', { name: /^恢复$/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^恢复$/ })[0]);
    await waitFor(() => screen.getByTestId('confirm-ok'));
    fireEvent.click(screen.getByTestId('confirm-ok'));
    await waitFor(() => {
      const calls: any[][] = fetchMock.mock.calls;
      const postCall = calls.find((c) => c[1]?.method === 'POST' && String(c[0]).includes('restore'));
      expect(postCall).toBeTruthy();
    });
  });

  it('空状态显示"暂无备份"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { backups: [] } }),
    });
    render(<Page />);
    await waitFor(() => {
      expect(screen.getByText(/暂无备份/)).toBeTruthy();
    });
  });
});
