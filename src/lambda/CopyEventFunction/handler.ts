import { addDays, differenceInDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'
import { getEventSeason } from '../../lib/event'
import { saveEvent } from '../lib/event'
import { authorizeEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId, removeRegistrationCreationMetadata, saveRegistration } from '../lib/registration'

const copyEventLambda = lambda('copyEvent', async (event) => {
  const { id, startDate }: { id: string; startDate: string } = parseJSONWithFallback(event.body)
  if (!getEventSeason(startDate)) {
    return response(400, { message: 'Bad request: startDate must be a valid date' }, event)
  }

  const { item, res, user } = await authorizeEvent(event, id)
  if (res) return res

  const timestamp = new Date().toISOString()

  if (!getEventSeason(item.startDate) || !getEventSeason(item.endDate)) {
    return response(400, { message: 'Bad request: source event dates must be valid' }, event)
  }

  item.id = nanoid(10)
  item.name = `Kopio - ${item.name ?? ''}`
  item.state = 'draft'
  item.createdAt = timestamp
  item.createdBy = user.name
  delete item.entryOrigEndDate

  // modification info is always updated
  item.modifiedAt = timestamp
  item.modifiedBy = user.name

  const days = differenceInDays(parseISO(startDate), parseISO(item.startDate))
  item.startDate = addDays(parseISO(item.startDate), days).toISOString()
  item.season = getEventSeason(item.startDate)
  item.endDate = addDays(parseISO(item.endDate), days).toISOString()
  if (item.entryStartDate) item.entryStartDate = addDays(parseISO(item.entryStartDate), days).toISOString()
  if (item.entryEndDate) item.entryEndDate = addDays(parseISO(item.entryEndDate), days).toISOString()

  item.classes.forEach((c) => {
    if (c.date) c.date = addDays(parseISO(c.date), days).toISOString()
  })

  await saveEvent(item)

  const registrations = await getRegistrationsByEventId(id)

  for (const reg of registrations ?? []) {
    reg.eventId = item.id
    // These values belong to the source creation attempt and must not be
    // inherited by a registration in the copied event.
    removeRegistrationCreationMetadata(reg)
    reg.dates.forEach((d) => {
      d.date = addDays(parseISO(d.date), days).toISOString()
    })
    if (reg.group) {
      if (reg.group.date && reg.group.key) {
        reg.group.date = addDays(parseISO(reg.group.date), days).toISOString()
        reg.group.key = `${reg.group.date.slice(0, 10)}-${reg.group.time}`
      }
    }
    await saveRegistration(reg)
  }

  return response(200, item, event)
})

export default copyEventLambda
