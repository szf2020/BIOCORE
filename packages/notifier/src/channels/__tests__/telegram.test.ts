import { describe, it, expect, vi } from 'vitest';
import { sendTelegram } from '../telegram';

describe('sendTelegram', () => {
  it('uses chat_id from secret + bold title + severity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await sendTelegram(
      { webhook_url: 'https://api.telegram.org/bot123:ABC/sendMessage', secret: '-100123' },
      { title: 'BIOCore alert', body: 'PLC offline', severity: 'critical', raw: {} },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe('-100123');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toContain('*BIOCore alert*');
    expect(body.text).toContain('critical');
    expect(body.text).toContain('PLC offline');
    fetchSpy.mockRestore();
  });

  it('returns ok=false without making request when secret missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await sendTelegram(
      { webhook_url: 'https://api.telegram.org/bot123:ABC/sendMessage' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('chat_id');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns ok=true when telegram returns ok:true', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));
    const r = await sendTelegram(
      { webhook_url: 'https://x', secret: '123' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns ok=false when telegram returns ok:false', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 200 }));
    const r = await sendTelegram(
      { webhook_url: 'https://x', secret: '123' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns ok=false on HTTP non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('err', { status: 401 }));
    const r = await sendTelegram(
      { webhook_url: 'https://x', secret: '123' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    vi.restoreAllMocks();
  });

  it('returns ok=false on network error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('etimedout'));
    const r = await sendTelegram(
      { webhook_url: 'https://x', secret: '123' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('etimedout');
    vi.restoreAllMocks();
  });
});
