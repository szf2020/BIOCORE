import type { Channel } from './types';

/**
 * Generic webhook channel. POSTs the ChannelMessage as JSON. Receivers can
 * adapt to their own format (Slack, custom Lambda, internal IT system, etc).
 */
export const sendWebhook: Channel = async (config, msg) => {
  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
