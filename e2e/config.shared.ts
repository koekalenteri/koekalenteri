/**
 * What both browser test configs share: the local suite (`playwright.config.ts`) and the one run
 * against the test environment after a deploy there (`playwright.remote.config.ts`). The results
 * land in the same place, so `summary.mjs` writes the job summary of either run.
 */
import type { PlaywrightTestConfig } from '@playwright/test'
import { devices } from '@playwright/test'

const CI = !!process.env.CI

export const sharedConfig = {
  forbidOnly: CI,
  fullyParallel: false,
  outputDir: 'test-results/e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: CI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        // Read by e2e/summary.mjs for the job summary.
        ['json', { outputFile: 'test-results/e2e-results.json' }],
      ]
    : 'list',
  retries: 0,
  timeout: 60_000,
  use: {
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
  },
  workers: 1,
} satisfies PlaywrightTestConfig
