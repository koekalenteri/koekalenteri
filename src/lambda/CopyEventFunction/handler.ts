import { nanoid } from 'nanoid'
import { addFinnishDays, finnishDaysBetween } from '../../i18n/dates'
import { eventRegistrationDateKey, getEventSeason, stripKennelliittoLink } from '../../lib/event'
import { getRegistrationGroupKey, isStarter } from '../../lib/registration'
import { saveEvent } from '../lib/event'
import { authorizeEvent } from '../lib/eventAuth'
import { removeEventRuntimeState } from '../lib/eventCopy'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId, removeRegistrationCreationMetadata, saveRegistrations } from '../lib/registration'
import { publishEventChange } from '../lib/ws/actions'

const copyEventLambda = lambda('copyEvent', async (event) => {
  const { id, startDate }: { id: string; startDate: string } = parseJSONWithFallback(event.body)
  if (!getEventSeason(startDate)) {
    throw httpError(400, { message: 'Bad request: startDate must be a valid date' })
  }

  const { item, user } = await authorizeEvent(event, id)

  const timestamp = new Date().toISOString()

  if (!getEventSeason(item.startDate) || !getEventSeason(item.endDate)) {
    throw httpError(400, { message: 'Bad request: source event dates must be valid' })
  }

  // The source's live timeline and locks belong to its own run of the trial.
  removeEventRuntimeState(item)
  // The link to a Kennelliitto trial belongs to the event it was made for (KOE-1534): a second event
  // with the same GUID would send its results to the original's trial.
  stripKennelliittoLink(item)
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

  // Whole Finnish calendar days, so the copy keeps each date's Finnish wall-clock time across the change of time.
  const days = finnishDaysBetween(item.startDate, startDate)
  const shift = (date: string) => addFinnishDays(date, days)
  item.startDate = shift(item.startDate)
  item.season = getEventSeason(item.startDate)
  item.endDate = shift(item.endDate)
  if (item.entryStartDate) item.entryStartDate = shift(item.entryStartDate)
  if (item.entryEndDate) item.entryEndDate = shift(item.entryEndDate)

  item.classes.forEach((c) => {
    if (c.date) c.date = shift(c.date)
  })

  await publishEventChange(await saveEvent(item))

  const registrations = await getRegistrationsByEventId(id)

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
    reg.dates.forEach((d) => {
      d.date = shift(d.date)
    })
    if (reg.group?.date) {
      reg.group.date = shift(reg.group.date)
      // Only a start's key names its day, in the trial's time zone as every other writer keys it. A
      // cancelled entry gets the cancelled key even when the source row still carried a participant
      // key, and a reserve entry keeps its own (KOE-1537).
      reg.group.key = isStarter(reg)
        ? eventRegistrationDateKey({ date: new Date(reg.group.date), time: reg.group.time })
        : getRegistrationGroupKey(reg)
    }
    return reg
  })
  await saveRegistrations(copies)

  return response(200, item, event)
})

export default copyEventLambda
