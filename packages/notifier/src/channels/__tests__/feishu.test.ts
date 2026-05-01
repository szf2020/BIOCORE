import { describe, it, expect, vi } from 'vitest';
import { sendFeishu } from '../feishu';

describe('sendFeishu', () => {
  it('formats interactive card with red header for critical', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    const r = await sendFeishu(
      { webhook_url: 'https://open.feishu.cn/x' },
      { title: 'BIOCore alert', body: 'PLC offline', severity: 'critical', raw: {} },
    );
    expect(r.ok).toBe(true);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.msg_type).toBe('interactive');
    expect(body.card.header.title.content).toBe('BIOCore alert');
    expect(body.card.header.template).toBe('red');
    expect(JSON.stringify(body)).toContain('PLC offline');
    fetchSpy.mockRestore();
  });

  it('uses orange for warn', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    await sendFeishu(
      { webhook_url: 'https://open.feishu.cn/x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.card.header.template).toBe('orange');
    fetchSpy.mockRestore();
  });

  it('uses blue for info / unknown severity', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    await sendFeishu(
      { webhook_url: 'https://open.feishu.cn/x' },
      { title: 'T', body: 'B', severity: 'info', raw: {} },
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.card.header.template).toBe('blue');
    fetchSpy.mockRestore();
  });

  it('returns ok=true when feishu returns code:0', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    const r = await sendFeishu(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns ok=true when feishu returns StatusCode:0 (legacy)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ StatusCode: 0 }), { status: 200 }));
    const r = await sendFeishu(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns ok=false when feishu returns non-zero code', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ code: 19021 }), { status: 200 }));
    const r = await sendFeishu(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns ok=false on HTTP non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('err', { status: 500 }));
    const r = await sendFeishu(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
  });

  it('returns ok=false on network error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('refused'));
    const r = await sendFeishu(
      { webhook_url: 'https://x' },
      { title: 'T', body: 'B', severity: 'warn', raw: {} },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('refused');
    vi.restoreAllMocks();
  });
});
