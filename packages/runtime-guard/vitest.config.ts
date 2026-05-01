import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // crash-handler tests intentionally emit uncaughtException / unhandledRejection
    // events to verify our handler routing. Vitest's own listeners would otherwise
    // flag those as test-run failures even when our handler caught them.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
