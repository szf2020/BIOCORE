import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWsMessage, __testHooks } from '../realtime-store';

describe('sendWsMessage (SP-FX-2)', () => {
  beforeEach(() => { __testHooks.__resetWsForTests(); });

  it('throws when socket not connected', () => {
    expect(() => sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 }))
      .toThrowError(/not connected/i);
  });

  it('sends JSON-stringified message via the bound socket', () => {
    const fakeWs = { send: vi.fn(), readyState: 1 /* OPEN */ } as unknown as WebSocket;
    __testHooks.__bindWsForTests(fakeWs);
    sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 });
    expect(fakeWs.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fakeWs.send as any).mock.calls[0][0])).toEqual({
      type: 'set-value', tagId: 'F01.AI-0', value: 1,
    });
  });

  it('throws when socket readyState is not OPEN', () => {
    const fakeWs = { send: vi.fn(), readyState: 0 /* CONNECTING */ } as unknown as WebSocket;
    __testHooks.__bindWsForTests(fakeWs);
    expect(() => sendWsMessage({ type: 'set-value', tagId: 'F01.AI-0', value: 1 }))
      .toThrowError(/not connected/i);
  });
});
