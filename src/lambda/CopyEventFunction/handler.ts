import type { JsonRegistration } from '../../types'
import { addDays, differenceInDays, parseISO } from 'date-fns'
import { nanoid } from 'nanoid'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { getEvent } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTable)

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
  item.endDate = addDays(parseISO(item.endDate), days).toISOString()
  if (item.entryStartDate) item.entryStartDate = addDays(parseISO(item.entryStartDate), days).toISOString()
  if (item.entryEndDate) item.entryEndDate = addDays(parseISO(item.entryEndDate), days).toISOString()

  item.classes.forEach((c) => {
    if (c.date) c.date = addDays(parseISO(c.date), days).toISOString()
  })

  await dynamoDB.write(item)

  const registrations = await dynamoDB.query<JsonRegistration>({
    key: 'eventId = :id',
    table: registrationTable,
    values: { ':id': id },
  })
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
    await dynamoDB.write(reg, registrationTable)
  }

  return response(200, item, event)
})

export default copyEventLambda
