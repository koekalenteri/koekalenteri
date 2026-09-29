/**
 * Browser tests of the main paths (KOE-396): the production frontend build against the built lambda
 * bundles and a local DynamoDB. Playwright starts and stops the three servers itself and waits for
 * each to answer, so nothing is left running in the background. See e2e/README.md.
 */
import { defineConfig, devices } from '@playwright/test'
import { API_PORT, DYNAMODB_ENDPOINT, FAKES_PORT, FRONTEND_PORT, FRONTEND_URL } from './e2e/env.mjs'

const CI = !!process.env.CI

const server = (name: string, command: string, port: number, path = '/') => ({
  command,
  env: { DYNAMODB_ENDPOINT },
  name,
  reuseExistingServer: !CI,
  stderr: 'pipe' as const,
  stdout: 'ignore' as const,
  timeout: 30_000,
  url: `http://127.0.0.1:${port}${path}`,
})

export default defineConfig({
  forbidOnly: CI,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results/e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  retries: 0,
  testDir: 'e2e/tests',
  timeout: 60_000,
  use: {
    baseURL: FRONTEND_URL,
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
  },
  webServer: [
    server('Fakes', 'node e2e/fakes/server.mjs', FAKES_PORT, '/_health'),
    server('API', 'node e2e/server/api.mjs', API_PORT, '/_health'),
    server('Frontend', 'node e2e/server/frontend.mjs', FRONTEND_PORT),
  ],
  workers: 1,
})
