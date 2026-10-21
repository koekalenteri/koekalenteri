import type { ParseKeys } from 'i18next'
import type {
  JsonAuditChange,
  JsonAuditChangeValue,
  JsonAuditDetail,
  JsonAuditRecord,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonRegistration,
  Patch,
  RegistrationClass,
} from '../../types'
import {
  eventChangedAudit,
  eventCreatedAudit,
  eventDeletedAudit,
  eventSavedAudit,
  startListAudit,
} from '../../lib/audit'
import { getStartListPublishedClassMap, isStartListPublishedClassMap } from '../../lib/event'
import { isStartListFlagPublished } from '../../lib/publishing'
import { patchMerge } from '../../lib/utils'
import { logger } from './log'
import { readAuditTrail, writeAuditRecord } from './repositories/auditRepository'
import { publishAuditRecord } from './ws/auditPublisher'

export const registrationAuditKey = (reg: Pick<JsonRegistration, 'eventId' | 'id'>) => `${reg.eventId}:${reg.id}`
export const eventAuditKey = (event: Pick<JsonDogEvent, 'id'>) => `event:${event.id}`

type EventField = Extract<keyof JsonConfirmedEvent, string>
type EventFieldTranslationKey = Extract<ParseKeys<'translation'>, `event.${EventField}`>

const eventFieldTranslationKeys: Partial<Record<EventField, EventFieldTranslationKey>> = {
  classes: 'event.classes',
  contactInfo: 'event.contactInfo',
  cost: 'event.cost',
  costMember: 'event.costMember',
  createdAt: 'event.createdAt',
  createdBy: 'event.createdBy',
  dates: 'event.dates',
  deletedAt: 'event.deletedAt',
  deletedBy: 'event.deletedBy',
  description: 'event.description',
  descriptions: 'event.descriptions',
  endDate: 'event.endDate',
  entries: 'event.entries',
  entryEndDate: 'event.entryEndDate',
  entryOrigEndDate: 'event.entryOrigEndDate',
  entryStartDate: 'event.entryStartDate',
  eventType: 'event.eventType',
  id: 'event.id',
  invitationAttachment: 'event.invitationAttachment',
  judges: 'event.judges',
  kcGuid: 'event.kcGuid',
  kcId: 'event.kcId',
  location: 'event.location',
  modifiedAt: 'event.modifiedAt',
  modifiedBy: 'event.modifiedBy',
  name: 'event.name',
  names: 'event.names',
  official: 'event.official',
  organizer: 'event.organizer',
  places: 'event.places',
  priority: 'event.priority',
  restrictions: 'event.restrictions',
  secretary: 'event.secretary',
  startDate: 'event.startDate',
  state: 'event.state',
}

const eventAuditExcludedFields = new Set<string>([
  'id',
  'createdAt',
  'createdBy',
  'kcEvent',
  // Read from Kennelliitto, never saved by a person: a stale copy in a save body is no change of the event's.
  'kcState',
  'modifiedAt',
  'modifiedBy',
  'startListPublished',
  'updatedAt',
])

type EventAuditMessage = {
  changes?: JsonAuditChange[]
  details?: JsonAuditDetail[]
  messageKey: string
  messageParams?: Record<string, string | number | boolean>
}

const getStartListAuditMessages = (
  existing: JsonConfirmedEvent,
  item: Patch<JsonConfirmedEvent>
): EventAuditMessage[] => {
  if (item.startListPublished == null) return []

  if (typeof item.startListPublished === 'boolean') {
    const wasPublished = isStartListFlagPublished(existing, undefined)
    if (wasPublished === item.startListPublished) return []

    return [startListAudit(item.startListPublished)]
  }

  const existingMap = getStartListPublishedClassMap(existing)
  const startListPublished: Partial<Record<RegistrationClass, boolean>> = isStartListPublishedClassMap(
    existing.startListPublished
  )
    ? { ...existing.startListPublished }
    : {}

  for (const [eventClass, published] of Object.entries(item.startListPublished)) {
    if (typeof published === 'boolean') {
      startListPublished[eventClass as RegistrationClass] = published
    } else if (published === null) {
      delete startListPublished[eventClass as RegistrationClass]
    }
  }

  const nextMap = getStartListPublishedClassMap({ ...existing, startListPublished })
  return Object.entries(nextMap)
    .filter(([eventClass, published]) => existingMap[eventClass as RegistrationClass] !== published)
    .map(([eventClass, published]) => startListAudit(published, eventClass))
}

const formatAuditValue = (value: unknown): JsonAuditChangeValue => {
  if (value === undefined) return { state: 'empty' }
  if (value === null) return { state: 'removed' }
  if (typeof value === 'string') return value ? { text: value } : { state: 'empty' }
  if (typeof value === 'number' || typeof value === 'boolean') return { text: String(value) }

  return { text: JSON.stringify(value, null, 2) }
}

const getEventChanges = (
  existing: JsonConfirmedEvent,
  item: Patch<JsonConfirmedEvent>,
  next: JsonConfirmedEvent,
  fields: EventField[]
) =>
  fields.map((field) => ({
    field,
    labelKey: eventFieldTranslationKeys[field],
    next: formatAuditValue(item[field] === null ? null : next[field]),
    previous: formatAuditValue(existing[field]),
  }))

const valuesEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const getClassPlaceChanges = (
  existing: JsonConfirmedEvent['classes'],
  next: JsonConfirmedEvent['classes']
): JsonAuditChange[] | undefined => {
  if (!Array.isArray(existing) || !Array.isArray(next) || existing.length !== next.length) return undefined

  const changes: JsonAuditChange[] = []
  for (const [index, nextClass] of next.entries()) {
    const existingClass = existing[index]
    const { places: previousPlaces, ...existingIdentity } = existingClass
    const { places: nextPlaces, ...nextIdentity } = nextClass
    if (!valuesEqual(existingIdentity, nextIdentity)) return undefined
    if (previousPlaces === nextPlaces) continue

    changes.push({
      field: `classes.${index}.places`,
      labelKey: 'audit.fields.classPlaces',
      labelParams: {
        eventClass: nextClass.class,
        eventDate: nextClass.date,
      },
      next: formatAuditValue(nextPlaces),
      previous: formatAuditValue(previousPlaces),
    })
  }

  return changes
}

const totalClassPlaces = (classes: JsonConfirmedEvent['classes']) =>
  classes.reduce((total, eventClass) => total + (eventClass.places ?? 0), 0)

export const getEventAuditMessages = (
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>
): EventAuditMessage[] => {
  if (!existing) return [eventCreatedAudit()]
  if (item.deletedAt && !existing.deletedAt) return [eventDeletedAudit()]

  const messages: EventAuditMessage[] = getStartListAuditMessages(existing, item)
  const next = patchMerge(existing, item)
  let fields = Object.keys(item)
    .filter((key): key is EventField => !eventAuditExcludedFields.has(key))
    .filter((field) => !valuesEqual(existing[field], next[field]))

  const classPlaceChanges = fields.includes('classes')
    ? getClassPlaceChanges(existing.classes, next.classes)
    : undefined
  if (classPlaceChanges?.length) {
    fields = fields.filter((field) => field !== 'classes')
    if (
      fields.includes('places') &&
      existing.places === totalClassPlaces(existing.classes) &&
      next.places === totalClassPlaces(next.classes)
    ) {
      fields = fields.filter((field) => field !== 'places')
    }
  }

  const changes = [...(classPlaceChanges ?? []), ...getEventChanges(existing, item, next, fields)]
  if (changes.length) {
    messages.push(eventChangedAudit(changes))
  }

  return messages.length ? messages : [eventSavedAudit()]
}

/** Writes the record and tells the admins watching; a failed write is logged and never rejects. */
export const audit = async (item: Omit<JsonAuditRecord, 'timestamp'>) => {
  const record = { ...item, timestamp: new Date().toISOString() }
  try {
    await writeAuditRecord(record)
  } catch (e) {
    logger.error('failed to write audit record', { auditKey: item.auditKey, error: e })
    return
  }
  await publishAuditRecord(record)
}

/**
 * Durable workflow phases must not acknowledge an audit that failed to persist. Callers use this
 * variant when a retry marker follows the audit. The push after the write is best effort, as
 * every live push is.
 */
export const auditStrict = async (item: Omit<JsonAuditRecord, 'timestamp'>, effectId?: string) => {
  // auditKey + timestamp is the DynamoDB key. A durable workflow supplies a
  // stable effect id here, so retrying after a marker failure
  // overwrites the same audit item instead of creating another record.
  const record = { ...item, timestamp: effectId ?? new Date().toISOString() }
  await writeAuditRecord(record)
  await publishAuditRecord(record)
}

export const auditTrail = async (auditKey: string) => {
  try {
    return await readAuditTrail(auditKey)
  } catch (e) {
    logger.error('failed to read audit trail', { auditKey, error: e })
  }
  return []
}
