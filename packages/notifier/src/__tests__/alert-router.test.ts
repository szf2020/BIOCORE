import { describe, it, expect, vi } from 'vitest';
import { AlertRouter } from '../alert-router';
import type { Channel } from '../channels/types';

describe('AlertRouter', () => {
  function mockOk(): Channel {
    return vi.fn().mockResolvedValue({ ok: true });
  }

  it('routes event to matching enabled rule and dispatches to channel', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '2026-05-01T00:00:00Z' });
    expect(send).toHaveBeenCalledTimes(1);
    const [config, message] = (send as any).mock.calls[0];
    expect(config.webhook_url).toBe('http://x');
    expect(message.title).toBe('[BIOCore] plc_disconnect_5min');
    expect(message.severity).toBe('warn');
    expect(message.raw).toMatchObject({ reactor_id: 'R1' });
  });

  it('skips disabled rule', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: false }],
      send: { webhook: send },
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '2026-05-01T00:00:00Z' });
    expect(send).not.toHaveBeenCalled();
  });

  it('throttles second event with same reactor_id within window', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
      throttleMs: 60_000,
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '1' });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 6, last_seen: '2' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does NOT throttle different reactor_id', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
      throttleMs: 60_000,
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '1' });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R2', duration_min: 6, last_seen: '2' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does NOT throttle heap_growth_anomaly per spec R3', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'heap_growth_anomaly', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
      throttleMs: 60_000,
    });
    await router.emit('heap_growth_anomaly', { baseline_mb: 200, current_mb: 600, growth_pct: 200 });
    await router.emit('heap_growth_anomaly', { baseline_mb: 200, current_mb: 700, growth_pct: 250 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drops invalid payload (does not validate type-correctness)', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
    });
    // duration_min must be number
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 'oops' as any, last_seen: 'x' });
    expect(send).not.toHaveBeenCalled();
  });

  it('skips rule referencing missing channel', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'plc_disconnect_5min', channel_id: 'nonexistent', enabled: true }],
      send: { webhook: send },
    });
    await router.emit('plc_disconnect_5min', { reactor_id: 'R1', duration_min: 5.5, last_seen: '1' });
    expect(send).not.toHaveBeenCalled();
  });

  it('dispatches to multiple channels for same event', async () => {
    const sendW = mockOk();
    const sendF = mockOk();
    const router = new AlertRouter({
      channels: {
        ch1: { type: 'webhook', config: { webhook_url: 'http://x' } },
        ch2: { type: 'feishu', config: { webhook_url: 'http://feishu' } },
      },
      rules: [
        { event_type: 'oom_threshold', channel_id: 'ch1', enabled: true },
        { event_type: 'oom_threshold', channel_id: 'ch2', enabled: true },
      ],
      send: { webhook: sendW, feishu: sendF },
    });
    await router.emit('oom_threshold', { rss_mb: 1638, threshold_mb: 1500, samples: 3 });
    expect(sendW).toHaveBeenCalledTimes(1);
    expect(sendF).toHaveBeenCalledTimes(1);
  });

  it('records history of dispatches', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'process_restart', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
    });
    await router.emit('process_restart', { reason: 'manual_deploy' });
    const history = router.recentHistory();
    expect(history.length).toBe(1);
    expect(history[0].type).toBe('process_restart');
    expect(history[0].channel).toBe('ch1');
    expect(history[0].result.ok).toBe(true);
  });

  it('invokes onSent callback after non-throttled emit', async () => {
    const send = mockOk();
    const onSent = vi.fn();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [{ event_type: 'process_restart', channel_id: 'ch1', enabled: true }],
      send: { webhook: send },
    });
    router.onSent = onSent;
    await router.emit('process_restart', { reason: 'test' });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent.mock.calls[0][0]).toBe('process_restart');
    expect(onSent.mock.calls[0][1]).toMatchObject({ reason: 'test' });
  });

  it('setRules replaces rule list', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [],
      send: { webhook: send },
    });
    await router.emit('process_restart', { reason: 'x' });
    expect(send).not.toHaveBeenCalled();
    router.setRules([{ event_type: 'process_restart', channel_id: 'ch1', enabled: true }]);
    await router.emit('process_restart', { reason: 'y' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('severity is critical for uncaught_exception / oom / heap_growth', async () => {
    const send = mockOk();
    const router = new AlertRouter({
      channels: { ch1: { type: 'webhook', config: { webhook_url: 'http://x' } } },
      rules: [
        { event_type: 'uncaught_exception', channel_id: 'ch1', enabled: true },
        { event_type: 'oom_threshold', channel_id: 'ch1', enabled: true },
        { event_type: 'heap_growth_anomaly', channel_id: 'ch1', enabled: true },
      ],
      send: { webhook: send },
    });
    await router.emit('uncaught_exception', { message: 'x' });
    await router.emit('oom_threshold', { rss_mb: 1, threshold_mb: 1, samples: 1 });
    await router.emit('heap_growth_anomaly', { baseline_mb: 1, current_mb: 2, growth_pct: 100 });
    expect((send as any).mock.calls[0][1].severity).toBe('critical');
    expect((send as any).mock.calls[1][1].severity).toBe('critical');
    expect((send as any).mock.calls[2][1].severity).toBe('critical');
  });
});
