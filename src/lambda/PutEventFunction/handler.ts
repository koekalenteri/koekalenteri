import type { JsonConfirmedEvent, JsonDogEvent, JsonUser, Patch } from '../../types'
import { nanoid } from 'nanoid'
import { getEventSeason, isEventDeletable } from '../../lib/event'
import { isEntryOpen, patchMerge } from '../../lib/utils'
import { audit, eventAuditKey, getEventAuditMessages } from '../lib/audit'
import { authorize } from '../lib/auth'
import { findQualificationStartDate, getEvent, patchEvent, saveEvent, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'

const isUserForbidden = (
  user: JsonUser,
  existing: Partial<JsonConfirmedEvent> | undefined,
  item: Patch<JsonConfirmedEvent>
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
  const patchRequest = isPatchRequest(event)

  const item: Patch<JsonConfirmedEvent> = parseJSONWithFallback(event.body)
  const clientModifiedAt = item.modifiedAt
  if (patchRequest && !item.id) {
    return response(400, { message: 'Bad request: PATCH requires id' }, event)
  }

  const existing = item.id ? await getEvent<JsonConfirmedEvent>(item.id) : undefined

  if (isUserForbidden(user, existing, item)) {
    return response(403, 'Forbidden', event)
  }

  if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    return response(409, { error: 'staleData', message: 'Event has been modified since it was loaded' }, event)
  }

  if (item.deletedAt && !isEventDeletable(existing)) {
    console.log('Event is not deletable', { existing, item })
    return response(403, 'Forbidden', event)
  }

  if (!existing) {
    item.id = nanoid(10)
    item.createdAt = timestamp
    item.createdBy = user.name
  }

  if (
    existing &&
    isEntryOpen(existing) &&
    existing.entryEndDate &&
    !existing.entryOrigEndDate &&
    item.entryEndDate &&
    item.entryEndDate > existing.entryEndDate
  ) {
    // entry period was extended, use additional field to store the original entry end date
    item.entryOrigEndDate = existing.entryEndDate
  }

  const data = existing && patchRequest ? patchMerge(existing, item) : ({ ...existing, ...item } as JsonConfirmedEvent)
  if (data.startDate) {
    data.season = getEventSeason(data.startDate)
  }

  if (data.eventType === 'NOME-B SM' && !data.qualificationStartDate) {
    data.qualificationStartDate = await findQualificationStartDate(data.eventType, data.entryEndDate)
  }

  // modification info is always updated
  data.modifiedAt = timestamp
  data.modifiedBy = user.name
  data.updatedAt = timestamp

  let result: JsonDogEvent = data
  if (existing) {
    result = await patchEvent(existing.id, existing, data)
  } else {
    await saveEvent(data)
  }

  if (existing && existing.entries !== data.entries) {
    // update registrations in case the secretary version was out of date
    result = await updateRegistrations(data.id)
  }

  const auditKey = eventAuditKey(result)
  for (const auditMessage of getEventAuditMessages(existing, item)) {
    await audit({
      auditKey,
      ...auditMessage,
      user: user.name,
    })
  }

  return response(200, result, event)
})

export default putEventLambda
