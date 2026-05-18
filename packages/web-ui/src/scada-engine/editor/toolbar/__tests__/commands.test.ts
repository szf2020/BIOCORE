import { describe, it, expect, vi } from 'vitest';
import { executeSave, type CommandContext } from '../commands';

function makeCtx(saveImpl: (id: string) => Promise<void>): CommandContext {
  return {
    saveView: saveImpl,
    undo: vi.fn(),
    redo: vi.fn(),
    toggleGrid: vi.fn(),
  };
}

describe('commands.executeSave (SP-FX-4)', () => {
  it('returns ok=true when saveView resolves', async () => {
    const ctx = makeCtx(() => Promise.resolve());
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false with Error message when saveView rejects with Error', async () => {
    const ctx = makeCtx(() => Promise.reject(new Error('save failed: 500')));
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('save failed: 500');
  });

  it('returns ok=false with default "save failed" on non-Error throw', async () => {
    const ctx = makeCtx(() => Promise.reject('string-error'));
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('save failed');
  });

  it('passes viewId through to saveView', async () => {
    const saveFn = vi.fn(() => Promise.resolve());
    const ctx = makeCtx(saveFn);
    await executeSave(ctx, 'v_abc');
    expect(saveFn).toHaveBeenCalledWith('v_abc');
  });
});
