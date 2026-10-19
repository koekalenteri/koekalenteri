import { eventHasDayReadApart, registrationHasDayReadApart } from '../../lib/storedDays'
import { httpError } from './lambda'

interface StoredRows {
  event?: Parameters<typeof eventHasDayReadApart>[0]
  registrations?: ReadonlyArray<Parameters<typeof registrationHasDayReadApart>[0] | undefined>
}

/**
 * Refuses a save over stored rows that hold a day stored an hour off and not yet migrated (KOE-1547):
 * the request reads it as the day it falls on, the migration as the day it was stored for, and a save
 * now would leave the event and its registrations on different days for good. The refusal lasts until
 * the row's migration has run, minutes after a deploy; nothing is written.
 */
export const refuseDaysAwaitingMigration = ({ event, registrations = [] }: StoredRows) => {
  if ((event && eventHasDayReadApart(event)) || registrations.some((row) => row && registrationHasDayReadApart(row))) {
    throw httpError(503, { message: 'The trial is being updated. Try again in a few minutes.' })
  }
}
