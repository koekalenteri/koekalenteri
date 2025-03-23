import type { JsonConfirmedEvent, JsonUser } from '../../types'

import { nanoid } from 'nanoid'

import { isValidForEntry } from '../../lib/utils'
import { authorize } from '../lib/auth'
import { findQualificationStartDate, getEvent, saveEvent, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda } from '../lib/lambda'
import { response } from '../utils/response'

const isUserForbidden = (
  user: JsonUser,
  existing: Partial<JsonConfirmedEvent> | undefined,
  item: Partial<JsonConfirmedEvent>
): boolean => {
  if (user.admin) return false
  if (existing?.organizer?.id && !user.roles?.[existing.organizer.id]) return true
  if (item?.organizer?.id && !user.roles?.[item.organizer.id]) return true

  return false
}

const putEventLambda = lambda('putEvent', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()

  const item: Partial<JsonConfirmedEvent> = parseJSONWithFallback(event.body)
  const existing = item.id ? await getEvent<JsonConfirmedEvent>(item.id) : undefined

  if (isUserForbidden(user, existing, item)) {
    return response(403, 'Forbidden', event)
  }

  if (!existing) {
    item.id = nanoid(10)
    item.createdAt = timestamp
    item.createdBy = user.name
  }

  if (
    existing &&
    isValidForEntry(existing?.state) &&
    existing.entryEndDate &&
    !existing.entryOrigEndDate &&
    item.entryEndDate &&
    item.entryEndDate > existing.entryEndDate
  ) {
    // entry period was extended, use additional field to store the original entry end date
    item.entryOrigEndDate = existing.entryEndDate
  }

  const data = { ...existing, ...item } as JsonConfirmedEvent

  if (data.eventType === 'NOME-B SM' && !data.qualificationStartDate) {
    data.qualificationStartDate = await findQualificationStartDate(data.eventType, data.entryEndDate)
  }

  // modification info is always updated
  data.modifiedAt = timestamp
  data.modifiedBy = user.name

  await saveEvent(data)

  if (existing && existing.entries !== data.entries) {
    // update registrations in case the secretary version was out of date
    updateRegistrations(data.id)
  }

  return response(200, data, event)
})

export default putEventLambda
