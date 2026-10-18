/**
 * Before the tests against the test environment: what an earlier run left is deleted and the run's
 * own event is written, with its days counted from now, as the local suite's are. The tests read it
 * with `remoteEvent()`. After the tests the event is deleted again; the release workflow also runs
 * the sweep on its own, for a run cut short.
 *
 * The public list reads the event through an index that DynamoDB updates a moment after the write,
 * and the front page asks for the list once, so the tests start only when the API lists the event.
 * The wait also warms the list's function, which a deploy has just replaced.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { buildEvent, uniqueId } from '../fixtures/events'
import { REMOTE_EVENT_VARIABLE } from './event'
import { describeSweep, putTestEvent, sweepTestEvents, TEST_ORGANIZER } from './testEvents.mjs'

const LISTED_WITHIN_MS = 30_000
const POLL_INTERVAL_MS = 1_000

const requiredVariable = (name: string, what: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set: ${what}`)
  return value
}

/** Whether the public event list answers with the event; an error or a refusal is a no for now. */
const listsEvent = async (listUrl: string, id: string) => {
  try {
    const response = await fetch(listUrl)
    if (!response.ok) return false
    const events: unknown = await response.json()
    return Array.isArray(events) && events.some((event) => event?.id === id)
  } catch {
    return false
  }
}

const waitUntilListed = async (listUrl: string, id: string, deadline: number): Promise<void> => {
  if (await listsEvent(listUrl, id)) return
  if (Date.now() >= deadline) {
    throw new Error(`${listUrl} did not list ${id} within ${LISTED_WITHIN_MS / 1000} s of writing it`)
  }
  await sleep(POLL_INTERVAL_MS)
  return waitUntilListed(listUrl, id, deadline)
}

export default async function globalSetup() {
  requiredVariable('E2E_BASE_URL', 'the address of the frontend to test')
  const listUrl = `${requiredVariable('E2E_API_URL', 'the stack’s KoekalenteriFunctionApi').replace(/\/$/, '')}/event`

  console.log(`Before the run: ${describeSweep(await sweepTestEvents())}`)
  // No Kennel Club ids: another event linked to the same trial would share its lock with this one.
  const event = buildEvent({
    id: uniqueId(TEST_ORGANIZER.id),
    kcGuid: undefined,
    kcId: undefined,
    organizer: TEST_ORGANIZER,
  })
  await putTestEvent(event)
  const written = Date.now()
  try {
    await waitUntilListed(listUrl, event.id, written + LISTED_WITHIN_MS)
  } catch (error) {
    // No teardown runs after a failed setup: the event goes now, by key, not with the next run.
    console.log(`After the failed setup: ${describeSweep(await sweepTestEvents([event.id]))}`)
    throw error
  }
  console.log(`${listUrl} lists ${event.id} ${Date.now() - written} ms after the write`)
  process.env[REMOTE_EVENT_VARIABLE] = JSON.stringify(event)

  return async () => {
    console.log(`After the run: ${describeSweep(await sweepTestEvents())}`)
  }
}
