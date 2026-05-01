// Public API surface for @biocore/notifier.
// Modules added in subsequent tasks (T28-T33):
//   T28 throttler (5min dedup window)
//   T29-T32 channels (webhook / feishu / dingtalk / telegram)
//   T33 AlertRouter
export { eventTypes, validatePayload, type EventType, type EventPayload } from './event-types';
