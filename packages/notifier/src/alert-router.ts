import { Throttler } from './throttler';
import { validatePayload, type EventType, type EventPayload } from './event-types';
import type { Channel, ChannelConfig, ChannelMessage, SendResult } from './channels/types';
import { sendFeishu } from './channels/feishu';
import { sendDingtalk } from './channels/dingtalk';
import { sendTelegram } from './channels/telegram';
import { sendWebhook } from './channels/webhook';

export type ChannelType = 'feishu' | 'dingtalk' | 'telegram' | 'webhook';

export interface ChannelDef {
  type: ChannelType;
  config: ChannelConfig;
}

export interface Rule {
  event_type: EventType;
  channel_id: string;
  enabled?: boolean;
  min_severity?: 'info' | 'warn' | 'critical';
}

export interface AlertRouterOptions {
  channels: Record<string, ChannelDef>;
  rules: Rule[];
  throttleMs?: number;
  send?: Partial<Record<ChannelType, Channel>>;
}

interface HistoryEntry {
  ts: string;
  type: EventType;
  channel: string;
  result: SendResult;
}

/**
 * AlertRouter: events -> rule matching -> channel dispatch with throttling.
 *
 * Spec R3: heap_growth_anomaly is never throttled — heap leaks are rare and
 * serious; deduping risks masking sustained growth.
 */
const NEVER_THROTTLE: ReadonlySet<EventType> = new Set(['heap_growth_anomaly']);

export class AlertRouter {
  private channels: Record<string, ChannelDef>;
  private rules: Rule[];
  private readonly throttler: Throttler;
  private readonly senders: Record<ChannelType, Channel>;
  private readonly history: HistoryEntry[] = [];
  /** Optional callback fired after a successful (non-throttled) emit. */
  onSent?: (type: EventType, payload: unknown, results: Array<{ channel: string; result: SendResult }>) => void;

  constructor(opts: AlertRouterOptions) {
    this.channels = opts.channels;
    this.rules = opts.rules;
    this.throttler = new Throttler({ windowMs: opts.throttleMs ?? 5 * 60_000 });
    this.senders = {
      feishu: opts.send?.feishu ?? sendFeishu,
      dingtalk: opts.send?.dingtalk ?? sendDingtalk,
      telegram: opts.send?.telegram ?? sendTelegram,
      webhook: opts.send?.webhook ?? sendWebhook,
    };
  }

  async emit<T extends EventType>(type: T, payload: EventPayload<T>): Promise<void> {
    const validation = validatePayload(type, payload);
    if (!validation.success) {
      console.error('[notifier] invalid payload for', type, ':', validation.error);
      return;
    }

    const matching = this.rules.filter(r => r.event_type === type && r.enabled !== false);
    if (matching.length === 0) return;

    const reactor = (payload as { reactor_id?: string }).reactor_id ?? 'global';
    const key = `${type}:${reactor}`;

    if (!NEVER_THROTTLE.has(type)) {
      if (!this.throttler.shouldAllow(key)) {
        this.throttler.recordThrottled(key);
        return;
      }
      this.throttler.record(key);
    }

    const severity = this.severityFor(type);
    const message: ChannelMessage = {
      title: `[BIOCore] ${type}`,
      body: JSON.stringify(payload, null, 2),
      severity,
      raw: payload,
    };

    const results: Array<{ channel: string; result: SendResult }> = [];
    for (const rule of matching) {
      const ch = this.channels[rule.channel_id];
      if (!ch) continue;
      const result = await this.senders[ch.type](ch.config, message);
      this.history.push({ ts: new Date().toISOString(), type, channel: rule.channel_id, result });
      results.push({ channel: rule.channel_id, result });
    }

    if (this.onSent && results.length > 0) {
      try {
        this.onSent(type, payload, results);
      } catch {
        /* swallow — onSent failures shouldn't propagate */
      }
    }
  }

  recentHistory(limit = 50): HistoryEntry[] {
    return this.history.slice(-limit);
  }

  setRules(rules: Rule[]): void {
    this.rules = rules;
  }

  setChannels(channels: Record<string, ChannelDef>): void {
    this.channels = channels;
  }

  private severityFor(type: EventType): 'info' | 'warn' | 'critical' {
    if (type === 'uncaught_exception' || type === 'oom_threshold' || type === 'heap_growth_anomaly') return 'critical';
    if (type === 'plc_disconnect_5min') return 'warn';
    return 'info';
  }
}
