import { defineConfig, devices } from '@playwright/test'

/**
 * skills-ui E2E configuration — designed to run INSIDE the Dockerfile.e2e container.
 *
 * Tiers:
 *  - default run excludes @network specs (offline, deterministic)
 *  - set E2E_NETWORK=1 (docker run -e E2E_NETWORK=1) to include them
 *
 * Chromium-only by decision. Reports stay inside the container
 * (e2e/playwright-report, e2e/test-results) and are extracted only via
 * `docker cp` into e2e/output/ after the container exits.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  grepInvert: process.env.E2E_NETWORK ? undefined : /@network/,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
})
