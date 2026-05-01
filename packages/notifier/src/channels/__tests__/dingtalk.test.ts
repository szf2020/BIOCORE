import { describe, it, expect, vi } from 'vitest';
import { sendDingtalk, _computeSign } from '../dingtalk';

describe('_computeSign', () => {
  it('produces a URL-encoded HMAC-SHA256 base64 string', () => {
    const sign = _computeSign(1234567890000, 'SECabcdef');
    // URL-encoded base64 alphabet: A-Z a-z 0-9 + / = then % escapes
    expect(sign).toMatch(/^[A-Za-z0-9+/%=._-]+$/);
    expect(sign.length).toBeGreaterThan(20);
  });

  it('produces deterministic output for same inputs', () => {
    const a = _computeSign(1, 'secret');
    const b = _computeSign(1, 'secret');
    expect(a).toBe(b);
  });

  it('produces different output for different timestamp', () => {
    const a = _computeSign(1, 'secret');
    const b = _computeSign(2, 'secret');
    expect(a).not.toBe(b);
  });
});

describe('sendDingtalk', () => {
  it('appends timestamp + sign when secret provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    await sendDingtalk(
      { webhook_url: 'https://oapi.dingtalk.com/robot/send?access_token=T', secret: 'SECabc' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('access_token=T');
    expect(url).toMatch(/[?&]timestamp=\d+/);
    expect(url).toMatch(/[?&]sign=/);
    fetchSpy.mockRestore();
  });

  it('does not append sign when secret missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    await sendDingtalk(
      { webhook_url: 'https://oapi.dingtalk.com/robot/send?access_token=T' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain('timestamp=');
    expect(url).not.toContain('sign=');
    fetchSpy.mockRestore();
  });

  it('uses markdown msgtype with title and severity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    await sendDingtalk(
      { webhook_url: 'https://x' },
      { title: 'BIOCore alert', body: 'PLC offline', severity: 'critical', raw: {} },
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.msgtype).toBe('markdown');
    expect(body.markdown.title).toBe('BIOCore alert');
    expect(body.markdown.text).toContain('BIOCore alert');
    expect(body.markdown.text).toContain('critical');
    expect(body.markdown.text).toContain('PLC offline');
    fetchSpy.mockRestore();
  });

  it('returns ok=true when dingtalk returns errcode:0', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    const r = await sendDingtalk(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns ok=false on errcode != 0', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errcode: 310000, errmsg: 'sign mismatch' }), { status: 200 }));
    const r = await sendDingtalk(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns ok=false on HTTP non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('err', { status: 500 }));
    const r = await sendDingtalk(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
  });

  it('returns ok=false on network error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('econnrefused'));
    const r = await sendDingtalk(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('econnrefused');
    vi.restoreAllMocks();
  });
});
