import { defineConfig, devices } from '@playwright/test';

// Runs against the dev server; starts one if none is up. Neo4j is not required: the suite checks the
// honest offline fallback. Set E2E_BASE_URL to point at a server that has Neo4j configured.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4318',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  // Uses the installed Google Chrome so no browser download is needed; set PW_CHANNEL='' to use Playwright's own build.
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL ?? 'chrome' } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://127.0.0.1:4318', reuseExistingServer: true, timeout: 60_000 },
});
