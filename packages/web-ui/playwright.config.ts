import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // SP-FX-18: soak project — 90s timeout for 1-minute FPS/memory measurement
    {
      name: 'soak',
      testMatch: ['**/scada-soak.spec.ts'],
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Next.js dev server (web-ui)
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // BIOCore REST API server — MOCK_PLC=true 避免依赖真 PLC
      // 从 web-ui 目录向上两层到 repo root 后用 --filter 启动 server 包
      command: 'cd ../../ && MOCK_PLC=true pnpm --filter server dev',
      url: 'http://localhost:3001/api/v1/status',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
