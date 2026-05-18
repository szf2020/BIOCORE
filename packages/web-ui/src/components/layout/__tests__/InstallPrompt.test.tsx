/**
 * SP-FX-44: InstallPrompt component 单测
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InstallPrompt } from '../InstallPrompt';

// ─── Mock lucide-react ───────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  Download: () => <svg data-testid="download-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

// ─── Helper: fire beforeinstallprompt ────────────────────────────────────────

function fireInstallPromptEvent(
  promptFn = vi.fn().mockResolvedValue(undefined),
  outcome: 'accepted' | 'dismissed' = 'accepted',
) {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    preventDefault: vi.fn(),
    prompt: promptFn,
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无 beforeinstallprompt 事件时不渲染 banner', () => {
    render(<InstallPrompt />);
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });

  it('收到 beforeinstallprompt 事件后显示 banner', async () => {
    render(<InstallPrompt />);
    await act(async () => {
      fireInstallPromptEvent();
    });
    expect(screen.getByTestId('install-prompt')).toBeDefined();
  });

  it('点击关闭隐藏 banner 并设置 localStorage dismissed', async () => {
    render(<InstallPrompt />);
    await act(async () => {
      fireInstallPromptEvent();
    });
    expect(screen.getByTestId('install-prompt')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('dismiss-btn'));
    });

    expect(screen.queryByTestId('install-prompt')).toBeNull();
    expect(localStorage.getItem('biocore_install_dismissed')).toBe('1');
  });

  it('dismissed 标志存在时不显示 banner (localStorage guard)', async () => {
    localStorage.setItem('biocore_install_dismissed', '1');
    render(<InstallPrompt />);
    await act(async () => {
      fireInstallPromptEvent();
    });
    // dismissed flag 存在，useEffect 中 return 早退，不 setVisible
    expect(screen.queryByTestId('install-prompt')).toBeNull();
  });
});
