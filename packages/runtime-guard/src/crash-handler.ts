/**
 * Global handler for unrecoverable async errors.
 *
 * Supervisor (Docker/NSSM) is the source of truth on whether to restart;
 * we just log + dump diagnostics and let the supervisor's healthcheck decide.
 * We never call process.exit() — that would race with the supervisor.
 *
 * Note: in Node 16+, default behavior on unhandledRejection is to terminate.
 * Installing this handler effectively suppresses that. The user must ensure
 * onCrash writes a diagnostic dump so failures aren't silent.
 */
export type CrashType = 'uncaughtException' | 'unhandledRejection';
export type OnCrash = (err: Error, type: CrashType) => Promise<void> | void;

let installed = false;
let uncaughtFn: ((err: Error) => void) | undefined;
let rejectionFn: ((reason: unknown) => void) | undefined;

export function installCrashHandlers(opts: { onCrash: OnCrash }): void {
  if (installed) {
    console.warn('[runtime-guard] crash handlers already installed; ignoring duplicate install');
    return;
  }
  installed = true;

  const safeInvoke = (err: Error, type: CrashType) => {
    try {
      const result = opts.onCrash(err, type);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => { /* swallow async rejection */ });
      }
    } catch {
      /* swallow synchronous throw — don't make a crash worse */
    }
  };

  uncaughtFn = (err: Error) => {
    safeInvoke(err, 'uncaughtException');
  };
  rejectionFn = (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    safeInvoke(err, 'unhandledRejection');
  };

  process.on('uncaughtException', uncaughtFn);
  process.on('unhandledRejection', rejectionFn);
}

/** Test-only: detach handlers and reset module state */
export function _resetForTest(): void {
  if (uncaughtFn) process.off('uncaughtException', uncaughtFn);
  if (rejectionFn) process.off('unhandledRejection', rejectionFn);
  uncaughtFn = undefined;
  rejectionFn = undefined;
  installed = false;
}
