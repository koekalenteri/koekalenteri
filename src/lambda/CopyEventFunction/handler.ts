import { addDays, differenceInDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'
import { authorize } from '../lib/auth'
import { getEvent, saveEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId, saveRegistration } from '../lib/registration'

const copyEventLambda = lambda('copyEvent', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()

  const { id, startDate }: { id: string; startDate: string } = parseJSONWithFallback(event.body)
  const item = await getEvent(id)

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
  item.season = item.startDate.substring(0, 4)
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
