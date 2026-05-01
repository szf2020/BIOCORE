import type { Channel } from './types';

/**
 * Feishu (Lark) bot — interactive card. Header template color reflects severity.
 *
 * Feishu webhook setup:
 *   群 -> 设置 -> 群机器人 -> Custom Bot -> Copy webhook URL.
 * The URL takes the form: https://open.feishu.cn/open-apis/bot/v2/hook/<UUID>
 */
export const sendFeishu: Channel = async (config, msg) => {
  const template =
    msg.severity === 'critical' ? 'red' :
    msg.severity === 'warn' ? 'orange' : 'blue';

  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: msg.title },
        template,
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: msg.body } },
      ],
    },
  };

  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json().catch(() => ({})) as { code?: number; StatusCode?: number };
    return { ok: j.code === 0 || j.StatusCode === 0, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
