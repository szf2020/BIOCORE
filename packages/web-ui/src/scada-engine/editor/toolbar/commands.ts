// SP-FX-4: toolbar command wrappers — pure async functions for testability.

export interface CommandContext {
  saveView: (viewId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  toggleGrid: () => void;
}

export async function executeSave(
  ctx: CommandContext,
  viewId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ctx.saveView(viewId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'save failed' };
  }
}
