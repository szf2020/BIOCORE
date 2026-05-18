/**
 * SP-FX-44: useServiceWorker hook 单测
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServiceWorker } from '../useServiceWorker';

// ─── Mock navigator.serviceWorker ───────────────────────────────────────────

function makeMockRegistration(opts: {
  waiting?: Partial<ServiceWorker> | null;
}) {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    waiting: opts.waiting ?? null,
    installing: null,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    _trigger: (event: string) => {
      for (const cb of listeners[event] ?? []) cb();
    },
    _listeners: listeners,
  };
}

function makeMockServiceWorker() {
  return {
    state: 'installed',
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useServiceWorker', () => {
  it('初始状态: updateReady=false', async () => {
    const reg = makeMockRegistration({});
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(reg),
        addEventListener: vi.fn(),
        controller: null,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useServiceWorker());
    await act(async () => {});
    expect(result.current.updateReady).toBe(false);
  });

  it('reg.waiting 存在时立即 updateReady=true', async () => {
    const sw = makeMockServiceWorker();
    const reg = makeMockRegistration({ waiting: sw });
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(reg),
        addEventListener: vi.fn(),
        controller: null,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useServiceWorker());
    await act(async () => {});
    expect(result.current.updateReady).toBe(true);
  });

  it('skipWaiting 向 waitingWorker 发送 SKIP_WAITING 消息', async () => {
    const sw = makeMockServiceWorker();
    const reg = makeMockRegistration({ waiting: sw });
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(reg),
        addEventListener: vi.fn(),
        controller: null,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useServiceWorker());
    await act(async () => {});

    act(() => {
      result.current.skipWaiting();
    });

    expect(sw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});
