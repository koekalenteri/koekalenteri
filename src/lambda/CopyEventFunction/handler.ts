import type { DayKey } from '../../types'
import { nanoid } from 'nanoid'
import { addDays, daysBetween, isDayKey } from '../../lib/day'
import {
  getEventSeason,
  groupKeyOf,
  shiftPlacesPerDay,
  stripInvitationAttachments,
  stripKennelliittoLink,
} from '../../lib/event'
import { clearInvitationState, getRegistrationGroupKey, isStarter } from '../../lib/registration'
import {
  legacyEventDay,
  legacyRegistrationDays,
  rekeyEventDays,
  rekeyRegistrationDays,
  requestDay,
} from '../../lib/storedDays'
import { saveEvent } from '../lib/event'
import { authorizeEvent } from '../lib/eventAuth'
import { removeEventRuntimeState } from '../lib/eventCopy'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { removeRegistrationCreationMetadata } from '../lib/registration'
import { readEventRegistrations, writeRegistrations } from '../lib/repositories/registrationRepository'
import { publishEventChange } from '../lib/ws/actions'

const copyEventLambda = lambda('copyEvent', async (event) => {
  const { id, startDate }: { id: string; startDate: unknown } = parseJSONWithFallback(event.body)
  // A day key; a browser loaded before KOE-1547 sends the instant its Finnish day starts at.
  const newStartDay = requestDay(startDate)
  if (!newStartDay) {
    throw httpError(400, { message: 'Bad request: startDate must be a valid date' })
  }

  const { item, user } = await authorizeEvent(event, id)

  const timestamp = new Date().toISOString()

  // The source's days as keys: a row not yet migrated holds them as instants (KOE-1547).
  rekeyEventDays(item, legacyEventDay)
  if (!isDayKey(item.startDate) || !isDayKey(item.endDate)) {
    throw httpError(400, { message: 'Bad request: source event dates must be valid' })
  }

  // The source's live timeline and locks belong to its own run of the trial.
  removeEventRuntimeState(item)
  // The link to a Kennelliitto trial belongs to the event it was made for (KOE-1534): a second event
  // with the same GUID would send its results to the original's trial.
  stripKennelliittoLink(item)
  // The invitation attachments were written for the source's dates and instructions (KOE-1564).
  stripInvitationAttachments(item)
  item.id = nanoid(10)
  item.name = `Kopio - ${item.name ?? ''}`
  item.state = 'draft'
  // Publish decisions belong to the source event's runs, not the copy (see copyDogEvent).
  item.startListPublished = false
  item.startNumbersPublished = false
  delete item.resultsPublished
  item.createdAt = timestamp
  item.createdBy = user.name
  delete item.entryOrigEndDate

  // modification info is always updated
  item.modifiedAt = timestamp
  item.modifiedBy = user.name

  // Whole calendar days: a day key has no time of day for a change of time to move.
  const days = daysBetween(item.startDate, newStartDay)
  // A day the source holds no readable day in (a stored row from before the dates were checked) stays as it is.
  const shift = (day: DayKey) => (isDayKey(day) ? addDays(day, days) : day)
  item.startDate = shift(item.startDate)
  item.season = getEventSeason(item.startDate)
  item.endDate = shift(item.endDate)
  if (item.entryStartDate) item.entryStartDate = shift(item.entryStartDate)
  if (item.entryEndDate) item.entryEndDate = shift(item.entryEndDate)

  item.classes.forEach((c) => {
    if (c.date) c.date = shift(c.date)
  })
  item.dates?.forEach((d) => {
    d.date = shift(d.date)
  })
  // The posts move with their days (KOE-1563).
  item.stations?.forEach((station) => {
    station.date = shift(station.date)
  })
  // The places per day move with their days (KOE-1543).
  if (item.placesPerDay) item.placesPerDay = shiftPlacesPerDay(item.placesPerDay, days)

  await publishEventChange(await saveEvent(item))

  const registrations = await readEventRegistrations(id)

  const copies = (registrations ?? []).map((reg) => {
    reg.eventId = item.id
    // These values belong to the source creation attempt and must not be
    // inherited by a registration in the copied event.
    removeRegistrationCreationMetadata(reg)
    // What the dog did at the source event stays there: a copied entry has not run, and a frozen
    // start number would pin it to the source's published order.
    delete reg.startGroup
    delete reg.eventResult
    delete reg.kcResult
    // The entry was invited to the source event; the copy's secretary sends the copy's invitation.
    clearInvitationState(reg)
    rekeyRegistrationDays(reg, legacyRegistrationDays)
    reg.dates.forEach((d) => {
      d.date = shift(d.date)
    })
    if (reg.group?.date) {
      reg.group.date = shift(reg.group.date)
      // Only a start's key names its day, in the trial's time zone as every other writer keys it. A
      // cancelled entry gets the cancelled key even when the source row still carried a participant
      // key, and a reserve entry keeps its own (KOE-1537).
      reg.group.key = isStarter(reg) ? groupKeyOf(reg.group.date, reg.group.time) : getRegistrationGroupKey(reg)
    }
    return reg
  })
  await writeRegistrations(copies)

  return response(200, item, event)
})

export default copyEventLambda
