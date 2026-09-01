import type { JsonConfirmedEvent, JsonDogEvent, JsonUser, Patch, RegistrationClass } from '../../types'
import { nanoid } from 'nanoid'
import {
  getEventSeason,
  isEntryOpen,
  isEventDeletable,
  isStartNumbersAvailable,
  isStartNumbersAvailableForClass,
} from '../../lib/event'
import { patchMerge } from '../../lib/utils'
import { audit, eventAuditKey, getEventAuditMessages } from '../lib/audit'
import { authorize } from '../lib/auth'
import {
  findEventWithKcId,
  findQualificationStartDate,
  getEvent,
  patchEvent,
  saveEvent,
  updateRegistrations,
} from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'
import { moveOrganizerEventStats } from '../lib/stats'

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

/**
 * An event that predates the start number flag reads its absence as published (KOE-1006). When such
 * an event's start list publish state changes, freeze the numbers state to what the public list
 * showed before the change — publishing a list must never publish the numbers as a side effect
 * (KOE-1266).
 */
const freezeAbsentStartNumbersState = (
  data: JsonConfirmedEvent,
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>
) => {
  if (!existing || existing.startNumbersPublished !== undefined) return
  if (!Object.hasOwn(item, 'startListPublished') || Object.hasOwn(item, 'startNumbersPublished')) return

  if (existing.classes?.length) {
    const frozen: Partial<Record<RegistrationClass, boolean>> = {}
    for (const eventClass of existing.classes) {
      // A class can run on several days; its numbers stay out if any of its days had them out.
      frozen[eventClass.class] = frozen[eventClass.class] || isStartNumbersAvailableForClass(existing, eventClass)
    }
    data.startNumbersPublished = frozen
  } else {
    data.startNumbersPublished = isStartNumbersAvailable(existing)
  }
}

const restoreServerOwnedLocks = (data: JsonConfirmedEvent, existing: JsonConfirmedEvent | undefined) => {
  delete data.registrationGroupsLock
  if (existing?.registrationGroupsLock) data.registrationGroupsLock = existing.registrationGroupsLock
  delete data.registrationPaymentsLock
  if (existing?.registrationPaymentsLock) data.registrationPaymentsLock = existing.registrationPaymentsLock
  // The live timeline (KOE-1259) is written only through the turn endpoints; a stale copy riding an
  // event save must not clobber the spans a post recorded meanwhile.
  delete data.turns
  if (existing?.turns) data.turns = existing.turns
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
  // The numbers are the secretary's own decision (KOE-1006); old events lack the field and read as
  // published, so only a new event starts from the explicit 'not yet'.
  item.startNumbersPublished = false
  // A new event has no results to have published; a client-side copy would otherwise carry the flag.
  delete item.resultsPublished
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

interface PutEventPreconditionError {
  status: number
  body: unknown
}

/** Checks that can run before looking up the previously stored event. */
const checkPutEventRequestShape = (
  patchRequest: boolean,
  item: Patch<JsonConfirmedEvent>
): PutEventPreconditionError | undefined => {
  if (patchRequest && !item.id) {
    return { body: { message: 'Bad request: PATCH requires id' }, status: 400 }
  }

  const invalidField = invalidArrayField(item)
  if (invalidField) {
    return { body: { message: `Bad request: ${invalidField} must be an array` }, status: 400 }
  }
}

/** Checks that depend on the previously stored event, once it has been looked up. */
const checkPutEventAgainstExisting = (
  user: JsonUser,
  item: Patch<JsonConfirmedEvent>,
  existing: JsonConfirmedEvent | undefined,
  clientModifiedAt: string | null | undefined
): PutEventPreconditionError | undefined => {
  if (isUserForbidden(user, existing, item)) {
    return { body: 'Forbidden', status: 403 }
  }

  if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    return { body: { error: 'staleData', message: 'Event has been modified since it was loaded' }, status: 409 }
  }

  if (item.deletedAt && !isEventDeletable(existing)) {
    console.log('Event is not deletable', { existing, item })
    return { body: 'Forbidden', status: 403 }
  }
}

const auditEventChanges = async (
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>,
  result: JsonDogEvent,
  username: string
) => {
  const auditKey = eventAuditKey(result)
  for (const auditMessage of getEventAuditMessages(existing, item)) {
    await audit({ auditKey, ...auditMessage, user: username })
  }
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

  const requestShapeError = checkPutEventRequestShape(patchRequest, item)
  if (requestShapeError) {
    return response(requestShapeError.status, requestShapeError.body, event)
  }

  const existing = item.id ? await getEvent<JsonConfirmedEvent>(item.id) : undefined

  const existingError = checkPutEventAgainstExisting(user, item, existing, clientModifiedAt)
  if (existingError) {
    return response(existingError.status, existingError.body, event)
  }

  if (item.kcId != null && item.kcId !== existing?.kcId) {
    const conflict = await findEventWithKcId(item.kcId, existing?.id)
    if (conflict) {
      return response(
        409,
        { error: 'kcIdConflict', message: 'Kennel Club ID is already linked to another event' },
        event
      )
    }
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
  freezeAbsentStartNumbersState(data, existing, item)
  await updateEventDerivedFields(data)

  // modification info is always updated
  data.modifiedAt = timestamp
  data.modifiedBy = user.name
  data.updatedAt = timestamp

  // Update registrations in case the secretary version was out of date.
  const result = await persistEventWithRegistrations(existing, data)

  // Organizer stats are keyed by organizer + start date, so an edit to either has to carry the
  // already-counted registrations across rather than leave them under the old key. This and the
  // audit trail touch different tables and don't depend on each other, so they run together.
  await Promise.all([
    existing ? moveOrganizerEventStats(existing, data) : undefined,
    auditEventChanges(existing, item, result, user.name),
  ])

  // Do not expose the server-owned lock or its token in an admin response.
  const {
    registrationGroupsLock: _registrationGroupsLock,
    registrationPaymentsLock: _registrationPaymentsLock,
    ...responseData
  } = result
  return response(200, responseData, event)
})

export default putEventLambda
