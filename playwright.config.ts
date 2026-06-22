import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Triagent E2E tests.
 *
 * The mock provider injects 800-2000ms of artificial latency per AI call,
 * so per-test timeouts and per-expect timeouts are deliberately generous.
 *
 * `workers: 1` is intentional — the mock provider has timing-sensitive
 * shared state and serial execution avoids cross-test flakes.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
