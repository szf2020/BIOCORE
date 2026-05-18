// SP-FX-45: Plugin Admin UI 测试 (TDD RED-first)
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// mock plugin loader
const mockListPlugins = vi.fn(() => [] as any[]);
const mockRegisterPlugin = vi.fn();
const mockUnregisterPlugin = vi.fn();

vi.mock('@/scada-engine/plugins', () => ({
  listPlugins: () => mockListPlugins(),
  registerPlugin: (p: any) => mockRegisterPlugin(p),
  unregisterPlugin: (id: string) => mockUnregisterPlugin(id),
  clockWidgetPlugin: {
    id: 'com.biocore.sample.clock',
    name: '时钟示例 Widget',
    version: '1.0.0',
    widgets: [{ widgetType: 'sample-clock', create: vi.fn(), getSignals: vi.fn(() => []) }],
  },
}));

import PluginsPage from '../page';

describe('Plugin Admin UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPlugins.mockReturnValue([]);
  });

  it('1. 无 plugin 时渲染空状态提示', () => {
    render(<PluginsPage />);
    expect(screen.getByText(/暂无已加载 Plugin/i)).toBeInTheDocument();
  });

  it('2. 有 plugin 时渲染 plugin ID 和名称', () => {
    mockListPlugins.mockReturnValue([
      { id: 'com.test.widget', name: 'Test Widget', version: '1.0.0', widgets: [] },
    ]);
    render(<PluginsPage />);
    expect(screen.getByText('com.test.widget')).toBeInTheDocument();
    expect(screen.getByText('Test Widget')).toBeInTheDocument();
  });

  it('3. 点击"加载示例"调用 registerPlugin', async () => {
    render(<PluginsPage />);
    const btn = screen.getByRole('button', { name: /加载示例/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockRegisterPlugin).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'com.biocore.sample.clock' }),
      );
    });
  });

  it('4. 点击"卸载"调用 unregisterPlugin(id)', async () => {
    mockListPlugins.mockReturnValue([
      { id: 'com.test.plugin', name: 'Test', version: '1.0.0', widgets: [] },
    ]);
    render(<PluginsPage />);
    const btn = screen.getByRole('button', { name: /卸载/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockUnregisterPlugin).toHaveBeenCalledWith('com.test.plugin');
    });
  });

  it('5. registerPlugin 抛出错误时页面显示错误信息', async () => {
    mockRegisterPlugin.mockImplementation(() => {
      throw new Error('already registered');
    });
    render(<PluginsPage />);
    const btn = screen.getByRole('button', { name: /加载示例/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
