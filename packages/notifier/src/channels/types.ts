/**
 * Shared interfaces for notifier channels (Sprint 4 Track A spec §6.3).
 * All concrete channels (webhook / feishu / dingtalk / telegram) implement
 * the same Channel signature so AlertRouter can dispatch uniformly.
 */
export interface ChannelConfig {
  webhook_url: string;
  /** Per-channel secret (sign for dingtalk; chat_id for telegram). */
  secret?: string;
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface ChannelMessage {
  title: string;
  body: string;
  severity: string;
  raw: unknown;
}

export type Channel = (config: ChannelConfig, message: ChannelMessage) => Promise<SendResult>;
