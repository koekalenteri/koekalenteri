/**
 * The browser tests run against a deployed stack, the test environment after a deploy there
 * (KOE-1559): no servers of its own, the frontend at E2E_BASE_URL and one event written into the
 * stack's event table (E2E_EVENT_TABLE) for the run. Nothing here needs a login or a payment, and the
 * registration form is never sent. See e2e/README.md.
 *
 * The variables are read when the tests run, not here, so `playwright test --list` (the catalog)
 * works without them.
 */
import { defineConfig } from '@playwright/test'
import { sharedConfig } from './e2e/config.shared'

export default defineConfig({
  ...sharedConfig,
  globalSetup: './e2e/remote/global-setup.ts',
  testDir: 'e2e/remote/tests',
  use: { ...sharedConfig.use, baseURL: process.env.E2E_BASE_URL },
})
