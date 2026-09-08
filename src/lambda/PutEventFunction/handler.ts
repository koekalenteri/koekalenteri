import type { JsonConfirmedEvent, JsonDogEvent, JsonUser, Patch, RegistrationClass } from '../../types'
import type { EventChange } from '../lib/event'
import { nanoid } from 'nanoid'
import {
  getEventSeason,
  isEntryOpen,
  isEventDeletable,
  isStartNumbersAvailable,
  isStartNumbersAvailableForClass,
} from '../../lib/event'
import { eventBodySchema } from '../../lib/schema/event'
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
import { httpError, isPatchRequest, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { validateBody } from '../lib/request'
import { moveOrganizerEventStats } from '../lib/stats'
import { publishEventChange, publishEventCounts } from '../lib/ws/actions'

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

const persistEvent = async (
  existing: JsonConfirmedEvent | undefined,
  data: JsonConfirmedEvent
): Promise<{ event: JsonDogEvent; change?: EventChange }> => {
  if (existing) return patchEvent(existing.id, existing, data)

  return { change: await saveEvent(data), event: data }
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

/**
 * Saves the event and sends on what changed. The domain says what happened; broadcasting is this
 * layer's job (KOE-1340), and a recount has counts of its own to send.
 */
const persistEventWithRegistrations = async (
  existing: JsonConfirmedEvent | undefined,
  data: JsonConfirmedEvent
): Promise<JsonDogEvent> => {
  const { change, event } = await persistEvent(existing, data)
  if (change) await publishEventChange(change)

  if (existing && existing.entries !== data.entries) {
    const recounted = await updateRegistrations(data.id)
    await publishEventCounts(recounted)

    return recounted
  }

  return event
}

/** Checks that can run before looking up the previously stored event; a failed one is thrown. */
const checkPutEventRequestShape = (patchRequest: boolean, item: Patch<JsonConfirmedEvent>) => {
  if (patchRequest && !item.id) {
    throw httpError(400, { message: 'Bad request: PATCH requires id' })
  }
}

/** Checks that depend on the previously stored event, once it has been looked up; a failed one is thrown. */
const checkPutEventAgainstExisting = (
  user: JsonUser,
  item: Patch<JsonConfirmedEvent>,
  existing: JsonConfirmedEvent | undefined,
  clientModifiedAt: string | null | undefined
) => {
  if (isUserForbidden(user, existing, item)) {
    throw httpError(403, 'Forbidden')
  }

  if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    throw httpError(409, { error: 'staleData', message: 'Event has been modified since it was loaded' })
  }

  if (item.deletedAt && !isEventDeletable(existing)) {
    logger.info('event is not deletable', { eventId: item.id })
    throw httpError(403, 'Forbidden')
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
    throw httpError(401, 'Unauthorized')
  }

  const timestamp = new Date().toISOString()
  const patchRequest = isPatchRequest(event)

  const item: Patch<JsonConfirmedEvent> = parseJSONWithFallback(event.body)
  validateBody(eventBodySchema, item)

  const clientModifiedAt = item.modifiedAt

  checkPutEventRequestShape(patchRequest, item)

  const existing = item.id ? await getEvent<JsonConfirmedEvent>(item.id) : undefined

  checkPutEventAgainstExisting(user, item, existing, clientModifiedAt)

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
  // The index key for the club's own list; a copy, because an index cannot key on a map's field (KOE-1341).
  data.organizerId = data.organizer?.id
  const invalidDateField = invalidEventDateField(data)
  if (invalidDateField) {
    throw httpError(400, { message: `Bad request: ${invalidDateField} must be a valid date` })
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
