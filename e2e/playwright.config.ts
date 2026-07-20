import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  grepInvert: process.env.E2E_NETWORK === '1' ? undefined : /@network/,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3456',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'mkdir -p "$HOME" && node /app/dist/cli/index.js serve --port 3456',
    url: 'http://127.0.0.1:3456/api/agents',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
