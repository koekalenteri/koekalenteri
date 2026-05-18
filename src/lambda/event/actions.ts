import type { JsonConfirmedEvent, JsonRegistration, JsonUser } from '../../types'
import { nanoid } from 'nanoid'
import { LambdaError } from '../lib/lambda'
import { type EventPublisher, eventPublisher, type RegistrationReadPort, registrationReadPort } from './api'
import { isEventDeletionForbidden, isEventWriteForbidden } from './policy'
import { type EventRepository, eventRepository } from './repository'
import { buildEventPatch, calculateEventAggregates, hasAggregateChanges, normalizeEventDraft } from './rules'

// ---------------------------------------------------------------------------
// Aggregate sync action
// ---------------------------------------------------------------------------

export type SyncEventAggregatesInput = {
  eventId: JsonConfirmedEvent['id']
  /** Pre-fetched registrations; if omitted the action will load them from the repository. */
  registrations?: JsonRegistration[]
}

export type SyncEventAggregatesDependencies = {
  registrations: RegistrationReadPort
  publisher: EventPublisher
  repository: EventRepository
}

export type SyncEventAggregatesResult = {
  event: JsonConfirmedEvent
  changed: boolean
}

/**
 * Load the event and its registrations, recalculate aggregate fields, persist only
 * if something changed, and publish websocket updates through the publisher port.
 *
 * This is the canonical replacement for the scatter of inline aggregate recalculation
 * logic currently living in [`updateRegistrations`](src/lambda/lib/event.ts:136).
 */
export const createSyncEventAggregates = ({
  registrations: registrationsPort,
  publisher,
  repository,
}: SyncEventAggregatesDependencies) => {
  return async ({ eventId, registrations: provided }: SyncEventAggregatesInput): Promise<SyncEventAggregatesResult> => {
    const event = await repository.getById(eventId)

    if (!event) {
      throw new LambdaError(404, `Event with id '${eventId}' was not found`)
    }

    const allRegistrations = provided ?? (await registrationsPort.listByEventId(eventId))
    const next = calculateEventAggregates(event, allRegistrations)

    if (!hasAggregateChanges(event, next)) {
      return { changed: false, event }
    }

    await repository.patchAggregates({
      eventId,
      set: {
        classes: next.classes,
        entries: next.entries,
        members: next.members,
      },
    })

    const updatedEvent: JsonConfirmedEvent = { ...event, ...next }

    await publisher.publishChange({
      organizerId: event.organizer.id,
      payload: {
        classes: next.classes,
        entries: next.entries,
        eventId,
        members: next.members,
      },
    })

    // Publish registration patches so subscriber views stay consistent
    await publisher.publishRegistrationPatches({
      eventId,
      organizerId: event.organizer.id,
      registrations: allRegistrations,
    })

    return { changed: true, event: updatedEvent }
  }
}

export const syncEventAggregates = createSyncEventAggregates({
  publisher: eventPublisher,
  registrations: registrationReadPort,
  repository: eventRepository,
})

// ---------------------------------------------------------------------------
// Save event action
// ---------------------------------------------------------------------------

export type SaveEventInput = {
  item: Partial<JsonConfirmedEvent>
  timestamp: string
  user: JsonUser
}

const AGGREGATE_AFFECTING_KEYS: ReadonlySet<keyof JsonConfirmedEvent> = new Set([
  'classes',
  'entries',
  'members',
  'entryStartDate',
  'entryEndDate',
  'entryOrigEndDate',
  'state',
])

export type SaveEventDependencies = {
  findQualificationStartDate: (eventType: string, entryEndDate: string) => Promise<string | undefined>
  publisher: EventPublisher
  repository: EventRepository
  syncAggregates?: (input: SyncEventAggregatesInput) => Promise<SyncEventAggregatesResult>
}

export type SaveEventResult = {
  created: boolean
  event: JsonConfirmedEvent
  aggregateSyncTriggered: boolean
}

export const createSaveEvent = ({
  findQualificationStartDate,
  publisher,
  repository,
  syncAggregates,
}: SaveEventDependencies) => {
  return async ({ item: rawItem, timestamp, user }: SaveEventInput): Promise<SaveEventResult> => {
    const existing = rawItem.id ? await repository.getById(rawItem.id) : undefined
    const item = normalizeEventDraft(rawItem, existing)

    if (isEventWriteForbidden(user, { existing, item })) {
      throw new Error('Forbidden')
    }

    if (isEventDeletionForbidden({ existing, item })) {
      throw new Error('Forbidden')
    }

    if (!existing) {
      const created = {
        ...item,
        createdAt: timestamp,
        createdBy: user.name,
        id: nanoid(10),
        modifiedAt: timestamp,
        modifiedBy: user.name,
      } as JsonConfirmedEvent

      if (created.eventType === 'NOME-B SM' && !created.qualificationStartDate) {
        created.qualificationStartDate = await findQualificationStartDate(created.eventType, created.entryEndDate)
      }

      const data = await repository.create(created)
      return { aggregateSyncTriggered: false, created: true, event: data }
    }

    const intended = {
      ...item,
      modifiedAt: timestamp,
      modifiedBy: user.name,
    } as Partial<JsonConfirmedEvent>

    const merged = { ...existing, ...intended } as JsonConfirmedEvent

    if (merged.eventType === 'NOME-B SM' && !merged.qualificationStartDate) {
      merged.qualificationStartDate = await findQualificationStartDate(merged.eventType, merged.entryEndDate)
      intended.qualificationStartDate = merged.qualificationStartDate
    }

    const patch = buildEventPatch(existing.id, existing, intended)
    const hasPatchChanges = Boolean(patch.set && Object.keys(patch.set).length) || Boolean(patch.remove?.length)

    if (!hasPatchChanges) {
      return { aggregateSyncTriggered: false, created: false, event: existing }
    }

    const updatedEvent = await repository.patch(patch)

    await publisher.publishChange({
      organizerId: updatedEvent.organizer.id,
      patch,
      payload: {
        eventId: updatedEvent.id,
      },
    })

    const patchSetKeys = patch.set ? (Object.keys(patch.set) as Array<keyof JsonConfirmedEvent>) : []
    const needsAggregateSync = patchSetKeys.some((key) => AGGREGATE_AFFECTING_KEYS.has(key))

    if (needsAggregateSync) {
      const doSync = syncAggregates ?? syncEventAggregates
      await doSync({ eventId: updatedEvent.id })
      return { aggregateSyncTriggered: true, created: false, event: updatedEvent }
    }

    return { aggregateSyncTriggered: false, created: false, event: updatedEvent }
  }
}

export const saveEvent = createSaveEvent({
  findQualificationStartDate: (eventType, entryEndDate) =>
    eventRepository.findQualificationStartDate(eventType, entryEndDate),
  publisher: eventPublisher,
  repository: eventRepository,
})
