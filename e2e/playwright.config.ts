import { defineConfig, devices } from '@playwright/test'

const networkAcceptance = process.env.E2E_NETWORK === '1'

export default defineConfig({
  testDir: './specs',
  outputDir: '/tmp/skills-ui-playwright-output',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  grep: networkAcceptance ? /@network/ : undefined,
  grepInvert: networkAcceptance ? undefined : /@network/,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3456',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'mkdir -p "$HOME" && node /app/dist/cli/index.js serve --port 3456',
    url: 'http://127.0.0.1:3456/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
