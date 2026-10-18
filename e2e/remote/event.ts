/**
 * The event the run's global setup wrote into the deployed stack, handed to the tests through an
 * environment variable: Playwright passes what global setup sets in `process.env` on to its workers.
 */
import type { EventRow } from '../fixtures/events'

export const REMOTE_EVENT_VARIABLE = 'E2E_REMOTE_EVENT'

export const remoteEvent = (): EventRow => {
  const json = process.env[REMOTE_EVENT_VARIABLE]
  if (!json) throw new Error(`${REMOTE_EVENT_VARIABLE} is not set: run the tests with playwright.remote.config.ts`)
  return JSON.parse(json)
}
