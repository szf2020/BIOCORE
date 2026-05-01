import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installCrashHandlers, _resetForTest } from '../crash-handler';

describe('crash-handler', () => {
  beforeEach(() => _resetForTest());

  it('routes uncaughtException to onCrash with original Error', async () => {
    const onCrash = vi.fn().mockResolvedValue(undefined);
    installCrashHandlers({ onCrash });
    process.emit('uncaughtException' as 'uncaughtException', new Error('boom'));
    await new Promise(r => setTimeout(r, 30));
    expect(onCrash).toHaveBeenCalledTimes(1);
    expect(onCrash.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onCrash.mock.calls[0][0].message).toBe('boom');
    expect(onCrash.mock.calls[0][1]).toBe('uncaughtException');
  });

  it('routes unhandledRejection (Error reason)', async () => {
    const onCrash = vi.fn().mockResolvedValue(undefined);
    installCrashHandlers({ onCrash });
    const dummy = Promise.resolve();
    process.emit('unhandledRejection' as 'unhandledRejection', new Error('reject'), dummy);
    await new Promise(r => setTimeout(r, 30));
    expect(onCrash).toHaveBeenCalledWith(expect.any(Error), 'unhandledRejection');
    expect(onCrash.mock.calls[0][0].message).toBe('reject');
  });

  it('wraps non-Error rejection reason', async () => {
    const onCrash = vi.fn().mockResolvedValue(undefined);
    installCrashHandlers({ onCrash });
    const dummy = Promise.resolve();
    process.emit('unhandledRejection' as 'unhandledRejection', 'string-reason', dummy);
    await new Promise(r => setTimeout(r, 30));
    expect(onCrash).toHaveBeenCalledTimes(1);
    expect(onCrash.mock.calls[0][0].message).toBe('string-reason');
  });

  it('swallows errors thrown by onCrash callback (does not propagate)', async () => {
    const onCrash = vi.fn(() => { throw new Error('callback failed'); });
    installCrashHandlers({ onCrash });
    expect(() => process.emit('uncaughtException' as 'uncaughtException', new Error('boom'))).not.toThrow();
    await new Promise(r => setTimeout(r, 30));
    expect(onCrash).toHaveBeenCalled();
  });

  it('install is idempotent (second call is no-op)', () => {
    const first = vi.fn();
    const second = vi.fn();
    installCrashHandlers({ onCrash: first });
    installCrashHandlers({ onCrash: second });
    process.emit('uncaughtException' as 'uncaughtException', new Error('x'));
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
