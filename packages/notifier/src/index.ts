// Public API surface for @biocore/notifier.
// Modules added in subsequent tasks (T28-T33):
//   T28 throttler (5min dedup window)
//   T29-T32 channels (webhook / feishu / dingtalk / telegram)
//   T33 AlertRouter
export { eventTypes, validatePayload, type EventType, type EventPayload } from './event-types';
export { Throttler, type ThrottlerOptions } from './throttler';
export { sendWebhook } from './channels/webhook';
export { sendFeishu } from './channels/feishu';
export { sendDingtalk } from './channels/dingtalk';
export { sendTelegram } from './channels/telegram';
export type { Channel, ChannelConfig, ChannelMessage, SendResult } from './channels/types';
