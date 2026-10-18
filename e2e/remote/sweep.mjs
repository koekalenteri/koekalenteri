/**
 * Deletes the deployed stack's browser test events (testEvents.mjs). The release workflow runs it
 * after the tests whatever their outcome, so a failed or cancelled run leaves no event in the
 * public list.
 *
 *   E2E_EVENT_TABLE=<the stack's EventTable> node e2e/remote/sweep.mjs
 */
import { describeSweep, sweepTestEvents } from './testEvents.mjs'

console.log(describeSweep(await sweepTestEvents()))
