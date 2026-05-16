import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Page from '../page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ viewId: 'v1' }),
  useSearchParams: () => ({ get: (k: string) => (k === 'reactor' ? 'F01' : null) }),
}));

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, isStale: false })),
}));

const SVG_VIEW = {
  id: 'v1',
  name: 'Test',
  is_svg: 1,
  items: { width: 800, height: 600, items: [] },
};

const LEGACY_VIEW = { id: 'v1', name: 'Legacy', is_svg: 0, items: {} };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('/scada2/[viewId] page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Replace window.location entirely so assign is writable
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  it('renders ScadaCanvas when is_svg=1', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, SVG_VIEW));
    const { container } = render(<Page />);
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
  });

  it('renders legacy notice when is_svg=0', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(200, LEGACY_VIEW));
    const { findByText } = render(<Page />);
    expect(await findByText(/Legacy view/i)).not.toBeNull();
  });

  it('renders 画面不存在 + back link on 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(404, { error: 'not found' }));
    const { findByText, findByRole } = render(<Page />);
    expect(await findByText('画面不存在')).not.toBeNull();
    expect((await findByRole('link', { name: /返回/ })).getAttribute('href')).toBe('/scada');
  });

  it('renders retry button on 500 and refetches on click', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, { error: 'oops' }))
      .mockResolvedValueOnce(jsonResponse(200, SVG_VIEW));
    const { findByRole, container } = render(<Page />);
    const btn = await findByRole('button', { name: /重试|retry/i });
    btn.click();
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('redirects to /login on 401', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    render(<Page />);
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/login'));
  });

  it('shows loading spinner before fetch resolves', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    const { getByRole } = render(<Page />);
    expect(getByRole('status').textContent).toMatch(/加载|loading/i);
  });
});
