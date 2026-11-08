import type { JsonConfirmedEvent, JsonDogEvent, JsonUser, Patch, RegistrationClass } from '../../types'
import type { EventChange } from '../lib/event'
import { nanoid } from 'nanoid'
import {
  formatTypeOf,
  getEventSeason,
  hasEntries,
  hasSharedReserveList,
  isClassShapeChange,
  isEntryOpen,
  isEventDateString,
  isEventDeletable,
  isSameResultsPublished,
  isStartNumbersAvailable,
  isStartNumbersAvailableForClass,
  moveClasslessKey,
  OFFICIAL_EVENT_TYPES,
  uniqueClasses,
} from '../../lib/event'
import { scoresAtPosts } from '../../lib/liveFormat'
import { hasPaymentLockingRegistrations, paymentTermsDiffer } from '../../lib/payment'
import { getStartListBlocker, isStartListFlagPublished } from '../../lib/publishing'
import { groupParticipantsByClass } from '../../lib/registration'
import { isOfficialFormatLocked } from '../../lib/results'
import { rotationShapeErrors } from '../../lib/rotation'
import { eventBodySchema } from '../../lib/schema/event'
import { legacyEventDay, rekeyEventDays, requestDay } from '../../lib/storedDays'
import { patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { audit, eventAuditKey, getEventAuditMessages } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import {
  findEventWithKcGuid,
  findEventWithKcId,
  findQualificationStartDate,
  getEvent,
  patchEvent,
  repairReadyRegistrationGroups,
  saveEvent,
  updateRegistrations,
} from '../lib/event'
import { recomputeEventResults } from '../lib/eventResults'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, isPatchRequest, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { readOrganizer } from '../lib/repositories/organizerRepository'
import { readEventRegistrations } from '../lib/repositories/registrationRepository'
import { validateBody } from '../lib/request'
import {
  publishEventChange,
  publishEventCounts,
  publishPublicStartList,
  publishRegistrationPatches,
} from '../lib/ws/actions'

const isMemberOfOrganizer = (memberOf: string[], organizerId: string | undefined) =>
  !!organizerId && memberOf.includes(organizerId)

/**
 * A club's members write its events, an admin any event. A stored event without an organizer has no
 * club whose members could change it, so only an admin may, and only by giving it one (KOE-1607).
 */
const isUserForbidden = (
  user: JsonUser,
  memberOf: string[],
  existing: Partial<JsonConfirmedEvent> | undefined,
  item: Patch<JsonConfirmedEvent>
): boolean => {
  if (user.admin) return false
  if (existing && !isMemberOfOrganizer(memberOf, existing.organizer?.id)) return true
  if (item?.organizer?.id && !isMemberOfOrganizer(memberOf, item.organizer.id)) return true

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
  if (!Object.hasOwn(item, 'startListPublished')) return

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

/**
 * The classes — or the classless event, as `undefined` — whose flag the request turns on. Only a
 * publish is held to the rules: hiding is always allowed, and a flag left as it was is not re-judged.
 */
const newlyPublished = (
  data: JsonConfirmedEvent,
  published: (event: JsonConfirmedEvent, eventClass: RegistrationClass | undefined) => boolean,
  existing: JsonConfirmedEvent
): Array<RegistrationClass | undefined> => {
  const classes: Array<RegistrationClass | undefined> = data.classes?.length ? uniqueClasses(data) : [undefined]
  return classes.filter((eventClass) => published(data, eventClass) && !published(existing, eventClass))
}

/**
 * The panel greys its buttons by the publishing rules, but a button is no guard: the same rules hold
 * here, from the same code (KOE-1466). The start list waits on its participants and their invitations.
 * The results are not published here at all, see putEventLambda.
 */
const checkPublishing = async (
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>,
  data: JsonConfirmedEvent
) => {
  if (!existing) return

  const startLists = Object.hasOwn(item, 'startListPublished')
    ? newlyPublished(data, isStartListFlagPublished, existing)
    : []
  if (startLists.length) {
    const participants = groupParticipantsByClass(await readEventRegistrations(data.id), data)
    for (const eventClass of startLists) {
      const reason = getStartListBlocker(data, eventClass, participants[eventClass ?? formatTypeOf(data)] ?? [])
      if (reason) throw httpError(422, { error: 'publishBlocked', eventClass, publish: 'startList', reason })
    }
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
  // What Kennelliitto last said of the trial (KOE-1140) comes from reading it, never from a save: a
  // copy riding an event save would put back a lock a hand-over just took, or lift one.
  delete data.kcState
  if (existing?.kcState) data.kcState = existing.kcState
  // The numbers are published only through PutStartNumbersFunction, which freezes them and holds the
  // publish to its rules; an event save must not flip them on the side (KOE-1466).
  if (existing) {
    delete data.startNumbersPublished
    if (existing.startNumbersPublished !== undefined) data.startNumbersPublished = existing.startNumbersPublished
  }
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
}

/**
 * The first date field that is not a valid date. A new event's dates are all checked; an update checks
 * only the dates it carries, so a stored row from before this check (a zone-less stamp, say) still takes
 * a change that does not touch its dates.
 */
const invalidEventDateField = (data: JsonConfirmedEvent, item: Patch<JsonConfirmedEvent>, isUpdate: boolean) =>
  (['startDate', 'endDate'] as const).find(
    (field) => (!isUpdate || item[field] !== undefined) && !isEventDateString(data[field])
  )

/**
 * Checks on the event as it would be saved; a failed one is thrown before anything is written. Every
 * saved event names its organizer: the club whose members may change it, and the key of its stats and
 * its change messages (KOE-1607).
 */
const checkMergedEvent = (data: JsonConfirmedEvent, item: Patch<JsonConfirmedEvent>, isUpdate: boolean) => {
  if (!data.organizer?.id) {
    throw httpError(400, { error: 'organizerRequired', message: 'Bad request: the event needs an organizer' })
  }
  const invalidDateField = invalidEventDateField(data, item, isUpdate)
  if (invalidDateField) {
    throw httpError(400, { message: `Bad request: ${invalidDateField} must be a valid date` })
  }
  // An official type runs by its own format; the type an unofficial trial follows is no field of its.
  if (data.officialFormat !== undefined && OFFICIAL_EVENT_TYPES.includes(data.eventType)) {
    throw httpError(400, {
      error: 'officialFormatOnOfficialType',
      message: 'Bad request: an official event type follows no other type',
    })
  }
  // Read on the merged event, so a patch of either half still has to fit the other (KOE-1665). A rotation
  // matters only where the results are scored at posts; no reader of another type reads one. Following
  // NOWT makes the stored posts and groups a rotation, so they are read then too (KOE-1718).
  if (
    scoresAtPosts(formatTypeOf(data)) &&
    (item.rotations !== undefined || item.stations !== undefined || Object.hasOwn(item, 'officialFormat'))
  ) {
    const rotationErrors = rotationShapeErrors(data)
    if (rotationErrors.length) {
      throw httpError(400, {
        error: 'invalidRotation',
        errors: rotationErrors,
        message: 'Bad request: the rotation groups do not fit the posts',
      })
    }
  }
}

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

/**
 * Results are published a day at a time through PutResultsPublishedFunction, which folds the day into
 * the stored flag and holds it to its rules (KOE-1510); a save never changes it. A save that still
 * carries the flag comes from a browser tab loaded before that. The same value is dropped, and a
 * different one is refused, so the old panel reports a failure instead of claiming a change that never
 * happened. A new event has no results, whatever a copy carried.
 */
const dropResultsPublished = (item: Patch<JsonConfirmedEvent>, existing: JsonConfirmedEvent | undefined) => {
  if (!Object.hasOwn(item, 'resultsPublished')) return
  if (existing && !isSameResultsPublished(existing, item.resultsPublished)) {
    // staleData, which that tab's event form already answers with "reload and redo"; a plain failure
    // would only have it retry the same request for ever.
    throw httpError(409, { error: 'staleData', message: 'Results are published a day at a time; reload the event' })
  }
  delete item.resultsPublished
}

/** Checks that depend on the previously stored event, once it has been looked up; a failed one is thrown. */
const checkPutEventAgainstExisting = (
  user: JsonUser,
  memberOf: string[],
  item: Patch<JsonConfirmedEvent>,
  existing: JsonConfirmedEvent | undefined,
  clientModifiedAt: string | null | undefined
) => {
  if (isUserForbidden(user, memberOf, existing, item)) {
    throw httpError(403, 'Forbidden')
  }

  if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
    throw httpError(409, { error: 'staleData', message: 'Event has been modified since it was loaded' })
  }

  if (item.deletedAt && !isEventDeletable(existing, CONFIG.stageName)) {
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

type KcLinkConflict = { error: 'kcGuidConflict' | 'kcGuidLocked' | 'kcIdConflict'; message: string }

/**
 * The 409 body when the event is being linked to a Kennelliitto trial another event is linked to
 * already. Only a link that changes is looked up (a save from the results page repeats the stored
 * one, and a null clears it), so an unchanged link never rescans the table.
 */
const findKcLinkConflict = async (
  item: Patch<JsonConfirmedEvent>,
  existing: JsonConfirmedEvent | undefined
): Promise<KcLinkConflict | undefined> => {
  if (item.kcId != null && item.kcId !== existing?.kcId && (await findEventWithKcId(item.kcId, existing?.id))) {
    return { error: 'kcIdConflict', message: 'Kennel Club ID is already linked to another event' }
  }
  if (
    item.kcGuid != null &&
    item.kcGuid !== existing?.kcGuid &&
    (await findEventWithKcGuid(item.kcGuid, existing?.id))
  ) {
    return { error: 'kcGuidConflict', message: 'Kennel Club trial is already linked to another event' }
  }
  return undefined
}

/**
 * A trial's results go to the Kennelliitto trial the event is linked to. Once anything has been sent
 * or read from it, moving the link would leave results in one trial and the event pointing at another
 * (KOE-1140), so the link stays until the copy of the event is made anew.
 */
const findKcGuidLock = async (
  item: Patch<JsonConfirmedEvent>,
  existing: JsonConfirmedEvent | undefined
): Promise<KcLinkConflict | undefined> => {
  if (!existing?.kcGuid || !Object.hasOwn(item, 'kcGuid') || (item.kcGuid ?? undefined) === existing.kcGuid) {
    return undefined
  }
  const sent = existing.kcState || (await readEventRegistrations(existing.id)).some((reg) => reg.kcResult)
  return sent ? { error: 'kcGuidLocked', message: 'Results have been sent to the linked Kennel Club trial' } : undefined
}

/**
 * The prices, the payment time and, with an early-bird rate, the entry start decide every entry's fee.
 * Once the event has registrations they stay as they are (KOE-1568), by the rule the event form locks
 * its fields with. The registrations are read only when a term actually changes.
 */
const checkPaymentLock = async (existing: JsonConfirmedEvent | undefined, data: JsonConfirmedEvent) => {
  if (!existing || !paymentTermsDiffer(existing, data)) return
  if (hasPaymentLockingRegistrations(await readEventRegistrations(existing.id))) {
    throw httpError(409, {
      error: 'paymentLocked',
      message: 'The event has registrations; its payment terms are locked',
    })
  }
}

/**
 * A change of the official type an unofficial trial follows (KOE-1718), checked before anything is
 * written. Once a post has run a turn or a dog has a result, the trial has run by its format, and the
 * type stays (`isOfficialFormatLocked`, the rule the event form disables the choice by). The entries
 * keep the class they were made in, so a change that gives the trial classes or takes them away is
 * refused once it has entries (`isClassShapeChange`). Answers whether the reserve lists' numbering
 * changes, which is renumbered once the event is saved.
 */
const checkOfficialFormatChange = async (
  existing: JsonConfirmedEvent | undefined,
  data: JsonConfirmedEvent
): Promise<{ renumber: boolean }> => {
  if (!existing || existing.officialFormat === data.officialFormat) return { renumber: false }

  // The turns are on the event: a trial that has run one needs no registration read to be locked.
  const registrations = existing.turns?.length ? [] : await readEventRegistrations(existing.id)
  if (isOfficialFormatLocked(existing, registrations)) {
    throw httpError(409, {
      error: 'officialFormatLocked',
      message: 'Results or turns are saved; the official type the event follows is locked',
    })
  }
  if (hasEntries(existing) && isClassShapeChange(existing, data)) {
    throw httpError(409, {
      error: 'officialFormatClassShape',
      message: 'The event has entries; the type it follows must keep its classes as they are',
    })
  }

  return {
    renumber: hasSharedReserveList(formatTypeOf(existing)) !== hasSharedReserveList(formatTypeOf(data)),
  }
}

/**
 * A WT trial numbers its reserves across the classes (KOE-912): a change of the followed type to or from
 * NOWT numbers them anew. Written after the event, so the numbering reads the saved type.
 */
const renumberReserves = async (data: JsonConfirmedEvent, user: JsonUser) => {
  const groupPatches = await repairReadyRegistrationGroups(data.id, data, user)
  if (groupPatches.length) await publishRegistrationPatches(data.id, groupPatches, data.organizer.id)
}

/**
 * An event names an organizer this environment's table holds. Organizer ids are minted per
 * environment, so an id from another one (a copied row) makes the club show twice in the admin list
 * and leaves the event without the club's members and merchant (KOE-1580). Read only when the id is
 * new to the event: on a create or a change of organizer.
 */
const checkOrganizerExists = async (existing: JsonConfirmedEvent | undefined, data: JsonConfirmedEvent) => {
  const organizerId = data.organizer?.id
  if (!organizerId || organizerId === existing?.organizer?.id) return
  if (!(await readOrganizer(organizerId))) {
    throw httpError(400, { error: 'unknownOrganizer', message: `No organizer ${organizerId} in this environment` })
  }
}

/**
 * A deletion carries the server's time, not the one the browser sent: the admin list's incremental
 * fetch reads `deletedAt` as a stamp of the row, and a browser clock ahead would carry its cursor past
 * the edits that follow (KOE-1668). An event deleted before keeps the time it was deleted at.
 */
const stampDeletion = (data: JsonConfirmedEvent, existing: JsonConfirmedEvent | undefined, timestamp: string) => {
  if (data.deletedAt) data.deletedAt = existing?.deletedAt ?? timestamp
}

const putEventLambda = lambda('putEvent', async (event) => {
  const { memberOf, user } = await authorizeWithMemberOf(event)

  const timestamp = new Date().toISOString()
  const patchRequest = isPatchRequest(event)

  const item: Patch<JsonConfirmedEvent> = parseJSONWithFallback(event.body)
  validateBody(eventBodySchema, item)
  // Days are stored as keys (KOE-1547). A browser loaded before that sends instants, and a row not yet
  // migrated holds them: both are read as keys before anything compares, merges or audits them, so
  // the same day in the other form is no change.
  rekeyEventDays(item, requestDay)

  const clientModifiedAt = item.modifiedAt

  checkPutEventRequestShape(patchRequest, item)

  const existing = item.id ? await getEvent<JsonConfirmedEvent>(item.id) : undefined
  // The row as stored, whose days an unmigrated row holds as instants: the save writes it from this, so
  // the days the save keeps are written as keys too, together with the organizer stats row's move to
  // the key of the start. The checks, the merge and the audit read the days as keys.
  const stored = existing && structuredClone(existing)
  if (existing) rekeyEventDays(existing, legacyEventDay)

  checkPutEventAgainstExisting(user, memberOf, item, existing, clientModifiedAt)
  dropResultsPublished(item, existing)

  const kcConflict = (await findKcGuidLock(item, existing)) ?? (await findKcLinkConflict(item, existing))
  if (kcConflict) return response(409, kcConflict, event)

  if (!existing) {
    initializeNewEvent(item, timestamp, user.name)
  }

  if (shouldStoreOriginalEntryEndDate(existing, item)) {
    // entry period was extended, use additional field to store the original entry end date
    item.entryOrigEndDate = existing.entryEndDate
  }

  const merged =
    existing && patchRequest ? patchMerge(existing, item) : ({ ...existing, ...item } as JsonConfirmedEvent)
  // A whole-event save clears the followed type with a null as a patch does: absent, never stored null.
  if (merged.officialFormat === null) delete merged.officialFormat
  // A classless trial keys its links and attachment by its format, which a change of the followed
  // type moves (KOE-1718).
  const data = existing ? moveClasslessKey(merged, formatTypeOf(existing), formatTypeOf(merged)) : merged
  // The index key for the club's own list; a copy, because an index cannot key on a map's field (KOE-1341).
  data.organizerId = data.organizer?.id
  checkMergedEvent(data, item, !!existing)

  // The registration-group lock is server-owned. Never accept it from an
  // admin payload, including when the stored event currently has no lock.
  restoreServerOwnedLocks(data, existing)
  await checkOrganizerExists(existing, data)
  await checkPaymentLock(existing, data)
  const { renumber } = await checkOfficialFormatChange(existing, data)
  freezeAbsentStartNumbersState(data, existing, item)
  await checkPublishing(existing, item, data)
  await updateEventDerivedFields(data)

  // The stored results follow a change of the posts, the rotation or the classes, written before the
  // event so that a save stopped halfway is made again in full (KOE-1666).
  const resultPatches = await recomputeEventResults({
    confirmDrops: event.queryStringParameters?.confirmDrops,
    data,
    existing,
    timestamp,
    userName: user.name,
  })

  // modification info is always updated
  data.modifiedAt = timestamp
  data.modifiedBy = user.name
  data.updatedAt = timestamp
  stampDeletion(data, existing, timestamp)

  // Update registrations in case the secretary version was out of date.
  const result = await persistEventWithRegistrations(stored, data)
  if (resultPatches.length) {
    await publishRegistrationPatches(data.id, resultPatches, data.organizer.id)
    await publishPublicStartList(data.id)
  }
  if (renumber) await renumberReserves(data, user)

  await auditEventChanges(existing, item, result, user.name)

  // Do not expose the server-owned lock or its token in an admin response.
  const {
    registrationGroupsLock: _registrationGroupsLock,
    registrationPaymentsLock: _registrationPaymentsLock,
    ...responseData
  } = result
  return response(200, responseData, event)
})

export default putEventLambda
