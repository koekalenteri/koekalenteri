/**
 * Deletes the test environment's browser test events (testEvents.mjs). The release workflow runs it
 * after the tests whatever their outcome, so a failed or cancelled run leaves no event in the
 * public list.
 *
 *   E2E_EVENT_TABLE=<the stack's EventTable> node e2e/remote/sweep.mjs
 */
import { sweepTestEvents } from './testEvents.mjs'

const ids = await sweepTestEvents()
console.log(ids.length ? `Deleted ${ids.join(', ')}` : 'No browser test events to delete')
