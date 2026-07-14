import type { ParseKeys } from 'i18next'
import type {
  AuditRecord,
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
import { getStartListPublishedClassMap, isStartListPublishedClassMap } from '../../lib/event'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { publishAuditRecord } from './ws/auditPublisher'

const { auditTable } = CONFIG
const dynamoDB = new CustomDynamoClient(auditTable)

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
  endDate: 'event.endDate',
  entries: 'event.entries',
  entryEndDate: 'event.entryEndDate',
  entryOrigEndDate: 'event.entryOrigEndDate',
  entryStartDate: 'event.entryStartDate',
  eventType: 'event.eventType',
  id: 'event.id',
  invitationAttachment: 'event.invitationAttachment',
  judges: 'event.judges',
  kcId: 'event.kcId',
  location: 'event.location',
  modifiedAt: 'event.modifiedAt',
  modifiedBy: 'event.modifiedBy',
  name: 'event.name',
  official: 'event.official',
  organizer: 'event.organizer',
  places: 'event.places',
  priority: 'event.priority',
  secretary: 'event.secretary',
  startDate: 'event.startDate',
  state: 'event.state',
}

const eventAuditExcludedFields = new Set<string>([
  'id',
  'createdAt',
  'createdBy',
  'modifiedAt',
  'modifiedBy',
  'startListPublished',
  'updatedAt',
])

type EventAuditMessage = {
  changes?: JsonAuditChange[]
  details?: JsonAuditDetail[]
  message: string
  messageKey?: string
  messageParams?: Record<string, string | number | boolean>
}

const getStartListAuditMessages = (
  existing: JsonConfirmedEvent,
  item: Patch<JsonConfirmedEvent>
): EventAuditMessage[] => {
  if (item.startListPublished == null) return []

  if (typeof item.startListPublished === 'boolean') {
    const wasPublished = existing.startListPublished !== false
    if (wasPublished === item.startListPublished) return []

    return [
      {
        message: `Starttilista ${item.startListPublished ? 'julkaistu' : 'piilotettu'}`,
        messageKey: item.startListPublished ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden',
      },
    ]
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

  const nextMap = getStartListPublishedClassMap({
    classes: existing.classes,
    startListPublished,
  })
  return Object.entries(nextMap)
    .filter(([eventClass, published]) => existingMap[eventClass as RegistrationClass] !== published)
    .map(([eventClass, published]) => ({
      message: `${eventClass} starttilista ${published ? 'julkaistu' : 'piilotettu'}`,
      messageKey: published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden',
      messageParams: { eventClass },
    }))
}

const formatAuditValue = (value: unknown): JsonAuditChangeValue => {
  if (value === undefined) return { state: 'empty' }
  if (value === null) return { state: 'removed' }
  if (typeof value === 'string') return value ? { text: value } : { state: 'empty' }
  if (typeof value === 'number' || typeof value === 'boolean') return { text: String(value) }

  return { text: JSON.stringify(value, null, 2) }
}

const getEventChanges = (existing: JsonConfirmedEvent, item: Patch<JsonConfirmedEvent>, fields: EventField[]) =>
  fields.map((field) => ({
    field,
    labelKey: eventFieldTranslationKeys[field],
    next: formatAuditValue(item[field]),
    previous: formatAuditValue(existing[field]),
  }))

export const getEventAuditMessages = (
  existing: JsonConfirmedEvent | undefined,
  item: Patch<JsonConfirmedEvent>
): EventAuditMessage[] => {
  if (!existing) return [{ message: 'Tapahtuma luotu', messageKey: 'audit.messages.eventCreated' }]
  if (item.deletedAt && !existing.deletedAt) {
    return [{ message: 'Tapahtuma poistettu', messageKey: 'audit.messages.eventDeleted' }]
  }

  const messages: EventAuditMessage[] = getStartListAuditMessages(existing, item)
  const fields = Object.keys(item).filter((key): key is EventField => !eventAuditExcludedFields.has(key))

  if (fields.length) {
    const changes = getEventChanges(existing, item, fields)
    messages.push({
      changes,
      message: `Muutti: ${fields.join(', ')}`,
      messageKey: 'audit.changed',
    })
  }

  return messages.length ? messages : [{ message: 'Tapahtuma tallennettu', messageKey: 'audit.messages.eventSaved' }]
}

export const audit = async (item: Omit<AuditRecord, 'timestamp'>) => {
  try {
    const record = { ...item, timestamp: new Date().toISOString() }
    await dynamoDB.write(record, auditTable)
    await publishAuditRecord(record)
  } catch (e) {
    console.error(e)
  }
}

export const auditTrail = async (auditKey: string) => {
  try {
    const items = await dynamoDB.query<JsonAuditRecord>({
      key: 'auditKey = :auditKey',
      table: auditTable,
      values: { ':auditKey': auditKey },
    })
    return items ?? []
  } catch (e) {
    console.error(e)
  }
  return []
}
