import type { JsonConfirmedEvent, JsonDogEvent, JsonUser, Patch } from '../../types'
import { nanoid } from 'nanoid'
import { getEventSeason, isEntryOpen, isEventDeletable } from '../../lib/event'
import { patchMerge } from '../../lib/utils'
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

const invalidArrayField = (item: Patch<JsonConfirmedEvent>) =>
  (['classes', 'judges'] as const).find((field) => Object.hasOwn(item, field) && !Array.isArray(item[field]))

const shouldStoreOriginalEntryEndDate = (
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>
): existing is JsonConfirmedEvent =>
  Boolean(
    existing &&
      isEntryOpen(existing) &&
      existing.entryEndDate &&
      !existing.entryOrigEndDate &&
      item.entryEndDate &&
      item.entryEndDate > existing.entryEndDate
  )

const restoreServerOwnedLocks = (data: JsonConfirmedEvent, existing: JsonConfirmedEvent | undefined) => {
  delete data.registrationGroupsLock
  if (existing?.registrationGroupsLock) data.registrationGroupsLock = existing.registrationGroupsLock
  delete data.registrationPaymentsLock
  if (existing?.registrationPaymentsLock) data.registrationPaymentsLock = existing.registrationPaymentsLock
}

const persistEvent = async (existing: JsonConfirmedEvent | undefined, data: JsonConfirmedEvent) => {
  if (existing) return patchEvent(existing.id, existing, data)
  await saveEvent(data)
  return data
}

const initializeNewEvent = (item: Patch<JsonConfirmedEvent>, timestamp: string, username: string) => {
  item.id = nanoid(10)
  item.createdAt = timestamp
  item.createdBy = username
  item.startListPublished = false
}

const invalidEventDateField = (data: JsonConfirmedEvent) =>
  (['startDate', 'endDate'] as const).find((field) => {
    const date = data[field]
    return date === undefined || date === '' || typeof date !== 'string' || !getEventSeason(date)
  })

const updateEventDerivedFields = async (data: JsonConfirmedEvent) => {
  if (data.startDate) data.season = getEventSeason(data.startDate)
  if (data.eventType === 'NOME-B SM' && !data.qualificationStartDate) {
    data.qualificationStartDate = await findQualificationStartDate(data.eventType, data.entryEndDate)
  }
}

const persistEventWithRegistrations = async (
  existing: JsonConfirmedEvent | undefined,
  data: JsonConfirmedEvent
): Promise<JsonDogEvent> => {
  const result = await persistEvent(existing, data)
  if (existing && existing.entries !== data.entries) return updateRegistrations(data.id)
  return result
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

  const invalidField = invalidArrayField(item)
  if (invalidField) {
    return response(400, { message: `Bad request: ${invalidField} must be an array` }, event)
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
    initializeNewEvent(item, timestamp, user.name)
  }

  if (shouldStoreOriginalEntryEndDate(existing, item)) {
    // entry period was extended, use additional field to store the original entry end date
    item.entryOrigEndDate = existing.entryEndDate
  }

  const data = existing && patchRequest ? patchMerge(existing, item) : ({ ...existing, ...item } as JsonConfirmedEvent)
  const invalidDateField = invalidEventDateField(data)
  if (invalidDateField) {
    return response(400, { message: `Bad request: ${invalidDateField} must be a valid date` }, event)
  }

  // The registration-group lock is server-owned. Never accept it from an
  // admin payload, including when the stored event currently has no lock.
  restoreServerOwnedLocks(data, existing)
  await updateEventDerivedFields(data)

  // modification info is always updated
  data.modifiedAt = timestamp
  data.modifiedBy = user.name
  data.updatedAt = timestamp

  // Update registrations in case the secretary version was out of date.
  const result = await persistEventWithRegistrations(existing, data)

  const auditKey = eventAuditKey(result)
  for (const auditMessage of getEventAuditMessages(existing, item)) {
    await audit({
      auditKey,
      ...auditMessage,
      user: user.name,
    })
  }

  // Do not expose the server-owned lock or its token in an admin response.
  const {
    registrationGroupsLock: _registrationGroupsLock,
    registrationPaymentsLock: _registrationPaymentsLock,
    ...responseData
  } = result
  return response(200, responseData, event)
})

export default putEventLambda
