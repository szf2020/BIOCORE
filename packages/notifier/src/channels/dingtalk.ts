import crypto from 'node:crypto';
import type { Channel } from './types';

/**
 * DingTalk (钉钉) bot — markdown msgtype with optional HMAC-SHA256 加签.
 *
 * DingTalk webhook setup:
 *   群 -> 智能群助手 -> 添加 -> 自定义 -> "加签" (recommended) -> Copy webhook URL + secret.
 * URL form: https://oapi.dingtalk.com/robot/send?access_token=<TOKEN>
 * Secret looks like: SECxxxxxx (start with "SEC")
 *
 * If config.secret is provided, sign each request as DingTalk requires.
 * Otherwise (custom bots without sign), POST raw.
 */

/** Internal — exported for unit tests only. */
export function _computeSign(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  return encodeURIComponent(hmac);
}

export const sendDingtalk: Channel = async (config, msg) => {
  let url = config.webhook_url;
  if (config.secret) {
    const ts = Date.now();
    const sign = _computeSign(ts, config.secret);
    url = `${url}${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${sign}`;
  }

  const payload = {
    msgtype: 'markdown',
    markdown: {
      title: msg.title,
      text: `### ${msg.title}\n\n**Severity:** ${msg.severity}\n\n${msg.body}`,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({})) as { errcode?: number };
    return { ok: j.errcode === 0, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
