import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { EventPatch } from './repository'
import { hasPriority } from '../../lib/registration'
import { isEntryOpen } from '../../lib/utils'

type EventDraft = Partial<JsonConfirmedEvent>

type EventPatchField = keyof JsonConfirmedEvent

export const deriveEventSeason = (item: EventDraft, existing?: EventDraft): string | undefined => {
  if (!item.startDate || item.startDate === existing?.startDate) {
    return item.season
  }

  return item.startDate.substring(0, 4)
}

export const deriveEntryOrigEndDate = (item: EventDraft, existing?: JsonConfirmedEvent): string | undefined => {
  if (
    !existing ||
    !isEntryOpen(existing) ||
    !existing.entryEndDate ||
    existing.entryOrigEndDate ||
    !item.entryEndDate ||
    item.entryEndDate <= existing.entryEndDate
  ) {
    return item.entryOrigEndDate
  }

  return existing.entryEndDate
}

export const normalizeEventDraft = (item: EventDraft, existing?: JsonConfirmedEvent): EventDraft => {
  const season = deriveEventSeason(item, existing)
  const entryOrigEndDate = deriveEntryOrigEndDate(item, existing)

  return {
    ...item,
    ...(season ? { season } : {}),
    ...(entryOrigEndDate ? { entryOrigEndDate } : {}),
  }
}

export const buildEventPatch = (
  eventId: JsonConfirmedEvent['id'],
  existing: JsonConfirmedEvent,
  intended: Partial<JsonConfirmedEvent>
): EventPatch => {
  const set: Partial<Record<EventPatchField, JsonConfirmedEvent[EventPatchField]>> = {}
  const remove: EventPatchField[] = []

  for (const [rawKey, value] of Object.entries(intended) as Array<
    [EventPatchField, JsonConfirmedEvent[EventPatchField] | undefined]
  >) {
    if (value === undefined) {
      if (existing[rawKey] !== undefined) {
        remove.push(rawKey)
      }
      continue
    }

    if (existing[rawKey] !== value) {
      set[rawKey] = value
    }
  }

  return {
    eventId,
    ...(Object.keys(set).length ? { set } : {}),
    ...(remove.length ? { remove } : {}),
  }
}

// ---------------------------------------------------------------------------
// Aggregate calculation helpers
// ---------------------------------------------------------------------------

export type EventAggregatePatchFields = Pick<JsonConfirmedEvent, 'classes' | 'entries' | 'members'>

/**
 * Filter registrations that count toward event aggregates.
 * Only ready, non-cancelled registrations are included in entry and member counts.
 */
export const filterCountableRegistrations = (registrations: JsonRegistration[]): JsonRegistration[] =>
  registrations.filter((r) => r.state === 'ready' && !r.cancelled)

/**
 * Calculate per-class entry and member counts for an event given its countable registrations.
 *
 * Returns an updated classes array and a flag indicating whether any class value changed.
 * Mutates a copy of each class object so the original event is not modified.
 */
export const calculateClassAggregates = (
  event: Pick<JsonConfirmedEvent, 'classes'>,
  countableRegistrations: JsonRegistration[]
): { classes: JsonConfirmedEvent['classes']; classesChanged: boolean } => {
  let classesChanged = false
  const classes = event.classes.map((cls) => {
    const regsToClass = countableRegistrations.filter((r) => r.class === cls.class)
    const entries = regsToClass.length
    const members = regsToClass.filter((r) => hasPriority(event as JsonConfirmedEvent, r)).length

    if (entries !== cls.entries || members !== cls.members) {
      classesChanged = true
      return { ...cls, entries, members }
    }

    return cls
  })

  return { classes, classesChanged }
}

/**
 * Calculate top-level aggregate fields (entries, members, classes) for an event.
 *
 * Returns the new aggregate values. The caller is responsible for determining
 * whether the result differs from the current persisted state before writing.
 */
export const calculateEventAggregates = (
  event: Pick<JsonConfirmedEvent, 'classes'>,
  registrations: JsonRegistration[]
): EventAggregatePatchFields => {
  const countable = filterCountableRegistrations(registrations)
  const { classes } = calculateClassAggregates(event, countable)
  const entries = countable.length
  const members = countable.filter((r) => hasPriority(event as JsonConfirmedEvent, r)).length

  return { classes, entries, members }
}

/**
 * Determine whether the computed aggregate patch differs from the current persisted values.
 * Returns true when at least one aggregate field has changed.
 */
export const hasAggregateChanges = (
  event: Pick<JsonConfirmedEvent, 'classes' | 'entries' | 'members'>,
  next: EventAggregatePatchFields
): boolean => {
  if (event.entries !== next.entries || event.members !== next.members) return true
  if (event.classes.length !== next.classes.length) return true

  for (let i = 0; i < event.classes.length; i++) {
    const existing = event.classes[i]
    const updated = next.classes[i]
    if (!existing || !updated) return true
    if (existing.entries !== updated.entries || existing.members !== updated.members) return true
  }

  return false
}
