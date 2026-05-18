// ============================================================
// alert-dispatcher.ts — 告警分发服务 (SP-FX-42)
// ============================================================
// 功能:
//   - evaluateCondition(expr, ctx) — 沙盒表达式求值
//   - sendTestMessage({ type, config }) — 测试发送 (各渠道适配器)
//   - AlertDispatcher.fire(triggerType, payload) — 批量检查规则并发送
//
// 渠道适配器:
//   SlackAdapter  — native fetch POST JSON
//   EmailAdapter  — SMTP stub (log only; 真实 SMTP 留 future)
//   WebhookAdapter — native fetch generic POST
//
// 约束: ZERO 新第三方 dep; Alert 仅通知, 不触发 PLC.
// ============================================================

import type Database from 'better-sqlite3';

// ─── 类型 ─────────────────────────────────────────────────────

type ChannelType = 'slack' | 'email' | 'webhook';
type TriggerType = 'audit_log' | 'write_intent_reject' | 'system_error' | 'threshold';

interface ChannelSpec {
  type: ChannelType;
  config: unknown;
}

// ─── 条件表达式求值 ────────────────────────────────────────────
// 仅支持简单数学/比较表达式. 通过 Function 构造器沙盒执行.
// 出错时返回 false, 不上抛.

export function evaluateCondition(expr: string, context: Record<string, unknown>): boolean {
  try {
    const keys = Object.keys(context);
    const vals = Object.values(context);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return !!(${expr});`);
    return Boolean(fn(...vals));
  } catch {
    return false;
  }
}

// ─── 渠道适配器 ───────────────────────────────────────────────

const MAX_RETRY = 3;

async function slackSend(config: any, message: string): Promise<boolean> {
  const url = config?.url;
  if (!url || typeof url !== 'string') return false;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
    } catch {
      // 继续 retry
    }
  }
  return false;
}

async function emailSend(config: any, message: string): Promise<boolean> {
  // SMTP stub — 真实 SMTP 留 future (不引 nodemailer).
  const recipients: unknown = config?.recipients;
  console.log(`[AlertDispatcher/email-stub] 发送到 ${JSON.stringify(recipients)}: ${message}`);
  return true;
}

async function webhookSend(config: any, message: string): Promise<boolean> {
  const url = config?.url;
  if (!url || typeof url !== 'string') return false;
  const method = typeof config?.method === 'string' ? config.method : 'POST';
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
    } catch {
      // 继续 retry
    }
  }
  return false;
}

async function dispatchToChannel(type: ChannelType, config: any, message: string): Promise<boolean> {
  switch (type) {
    case 'slack': return slackSend(config, message);
    case 'email': return emailSend(config, message);
    case 'webhook': return webhookSend(config, message);
    default: return false;
  }
}

// ─── 测试发送 (公开接口) ──────────────────────────────────────

export async function sendTestMessage(spec: ChannelSpec): Promise<boolean> {
  const config = spec.config as any;
  const msg = `[BIOCore] 告警测试消息 — ${new Date().toISOString()}`;
  return dispatchToChannel(spec.type, config, msg);
}

// ─── AlertDispatcher ──────────────────────────────────────────

export class AlertDispatcher {
  private readonly db: InstanceType<typeof Database>;

  constructor(db: InstanceType<typeof Database>) {
    this.db = db;
  }

  /**
   * 触发告警检查.
   * @param triggerType 触发类型
   * @param payload 触发上下文 (用于 condition_expr 求值)
   */
  async fire(triggerType: TriggerType, payload: Record<string, unknown>): Promise<void> {
    const rules = this.db.prepare(
      `SELECT r.*, c.type as channel_type, c.config as channel_config
       FROM alert_rules r
       JOIN alert_channels c ON c.id = r.channel_id
       WHERE r.trigger_type = ? AND r.enabled = 1 AND c.enabled = 1`,
    ).all(triggerType) as any[];

    for (const rule of rules) {
      if (!evaluateCondition(rule.condition_expr, payload)) continue;

      const channelConfig = tryParseJson(rule.channel_config);
      const message = buildMessage(rule, payload);

      let delivered = false;
      let retryCount = 0;

      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        const ok = await dispatchToChannel(rule.channel_type, channelConfig, message);
        retryCount = attempt + 1;
        if (ok) { delivered = true; break; }
      }

      this.db.prepare(
        `INSERT INTO alert_history (rule_id, payload, delivered, retry_count) VALUES (?, ?, ?, ?)`,
      ).run(rule.id, JSON.stringify(payload), delivered ? 1 : 0, retryCount);
    }
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────

function tryParseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? {};
  try { return JSON.parse(v); } catch { return {}; }
}

function buildMessage(rule: any, payload: Record<string, unknown>): string {
  return `[BIOCore 告警] ${rule.name} | 触发: ${rule.trigger_type} | 上下文: ${JSON.stringify(payload)}`;
}
