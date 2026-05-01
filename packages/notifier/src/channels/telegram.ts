import type { Channel } from './types';

/**
 * Telegram bot — sends a Markdown-formatted message to a chat.
 *
 * Setup:
 *   1. Find @BotFather on Telegram, /newbot, get a token (looks like 123:ABC...)
 *   2. webhook_url = https://api.telegram.org/bot<TOKEN>/sendMessage
 *   3. secret = chat_id (numeric, often negative for groups, e.g. -100123456789)
 *      Find chat_id by sending a msg in the group, then visit
 *      https://api.telegram.org/bot<TOKEN>/getUpdates and look for "chat.id".
 */
export const sendTelegram: Channel = async (config, msg) => {
  if (!config.secret) {
    return { ok: false, error: 'telegram channel requires secret = chat_id' };
  }

  const text = `*${msg.title}*\n_severity:_ ${msg.severity}\n\n${msg.body}`;

  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.secret,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({})) as { ok?: boolean };
    return { ok: j.ok === true, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
