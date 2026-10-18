/**
 * Before the tests against the test environment: what an earlier run left is deleted and the run's
 * own event is written, with its days counted from now, as the local suite's are. The tests read it
 * with `remoteEvent()`. After the tests the event is deleted again; the release workflow also runs
 * the sweep on its own, for a run cut short.
 */
import { buildEvent, uniqueId } from '../fixtures/events'
import { REMOTE_EVENT_VARIABLE } from './event'
import { putTestEvent, sweepTestEvents, TEST_ORGANIZER } from './testEvents.mjs'

export default async function globalSetup() {
  if (!process.env.E2E_BASE_URL) throw new Error('E2E_BASE_URL is not set: the address of the frontend to test')

  await sweepTestEvents()
  // No Kennel Club ids: another event linked to the same trial would share its lock with this one.
  const event = buildEvent({
    id: uniqueId(TEST_ORGANIZER.id),
    kcGuid: undefined,
    kcId: undefined,
    organizer: TEST_ORGANIZER,
  })
  await putTestEvent(event)
  process.env[REMOTE_EVENT_VARIABLE] = JSON.stringify(event)

  return async () => {
    await sweepTestEvents()
  }
}
