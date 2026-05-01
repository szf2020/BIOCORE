import { describe, it, expect, vi } from 'vitest';
import { sendWebhook } from '../webhook';

describe('sendWebhook', () => {
  it('POSTs JSON to webhook_url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const r = await sendWebhook(
      { webhook_url: 'https://example.com/hook' },
      { title: 'T', body: 'B', severity: 'warn', raw: { x: 1 } },
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/hook');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ title: 'T', body: 'B', severity: 'warn', raw: { x: 1 } });
    fetchSpy.mockRestore();
  });

  it('returns ok=false on non-2xx', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('err', { status: 500 }));
    const r = await sendWebhook(
      { webhook_url: 'https://example.com/hook' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    fetchSpy.mockRestore();
  });

  it('returns ok=false with error message on network error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('connection refused'));
    const r = await sendWebhook(
      { webhook_url: 'https://example.com/hook' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('connection refused');
    fetchSpy.mockRestore();
  });
});
