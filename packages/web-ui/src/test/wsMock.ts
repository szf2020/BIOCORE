// Test helper: mock the realtime-store WS for tag-binding writeTag tests (SP-FX-2).
// Tests install this BEFORE the module under test runs so it captures the
// realtime-store.sendWsMessage pointer. Each writeTag() call resolves only
// after the test drains the queued ack via `flushAck()` or auto-acks via
// `autoAck()`.

import { vi } from 'vitest';

interface SentMessage {
  type: string;
  reqId?: string;
  [k: string]: unknown;
}

interface QueuedAck {
  reqId: string;
  ok: boolean;
  error?: string;
}

export interface MockWs {
  sent: SentMessage[];
  send: any; // vitest vi.fn mock
  flushAck: (ack: QueuedAck) => void;
  autoAck: (ok?: boolean, error?: string) => void;
  ackQueue: QueuedAck[];
  registerAckHandler: (fn: (ack: QueuedAck) => void) => void;
  triggerSendFailure: (err: Error) => void;
}

export function makeMockWs(): MockWs {
  let ackHandler: ((ack: QueuedAck) => void) | null = null;
  let sendError: Error | null = null;
  const sent: SentMessage[] = [];
  const ackQueue: QueuedAck[] = [];

  const send = vi.fn((msg: SentMessage) => {
    if (sendError) throw sendError;
    sent.push(msg);
  });

  return {
    sent,
    send,
    ackQueue,
    flushAck: (ack) => {
      ackQueue.push(ack);
      if (ackHandler) ackHandler(ack);
    },
    autoAck: (ok = true, error) => {
      const last = sent[sent.length - 1];
      if (!last || !last.reqId) throw new Error('autoAck: no reqId on last sent message');
      const ack: QueuedAck = { reqId: last.reqId as string, ok };
      if (error) ack.error = error;
      ackQueue.push(ack);
      if (ackHandler) ackHandler(ack);
    },
    registerAckHandler: (fn) => { ackHandler = fn; },
    triggerSendFailure: (err) => { sendError = err; },
  };
}
