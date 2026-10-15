import type { ConfirmedEvent, DogEvent, PublicOrganizer } from '@/types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { compareByLocalizedString } from '@/lib/client/sort'
import { compareEventsByDate, isEventOver } from '@/lib/event'
import { isConfirmedEvent } from '@/lib/typeGuards'
import { uniqueFn } from '@/lib/utils'
import {
  adminEventFilterTextAtom,
  adminEventIdAtom,
  adminEventsAtom,
  adminNewEventAtom,
  adminShowPastEventsAtom,
} from './atoms'

export const adminEventAtom = atomFamily((eventId: string | undefined) =>
  atom(
    (get) => {
      if (!eventId) return get(adminNewEventAtom)
      const events = get(adminEventsAtom)
      const fallback = get(adminNewEventAtom)
      return events instanceof Promise
        ? events.then((items) => items.find((event) => event.id === eventId) ?? fallback)
        : (events.find((event) => event.id === eventId) ?? fallback)
    },
    async (_get, set, value: DogEvent) => {
      if (!value) return
      // A new event went to the end of the list and a redated one stayed in its old slot until
      // the next full fetch (KOE-1302); keep the secretary's list in the same order the fetch uses.
      await set(adminEventsAtom, (events) =>
        [...events.filter((event) => event.id !== eventId), value].sort(compareEventsByDate)
      )
    }
  )
)

// Kennelliitto trials already linked to an event, so the picker can refuse one at pick time instead
// of leaving the secretary to discover the clash from the conflict the backend raises on save.
// A deleted event keeps its kcGuid (the delete only sets deletedAt) but no longer holds the trial,
// the way the server's scan sees it.
export const adminLinkedKcGuidsAtom = atomFamily((eventId: string | undefined) =>
  atom(async (get) => {
    const kcGuids = new Set<string>()
    for (const event of await get(adminEventsAtom)) {
      if (event.id !== eventId && event.kcGuid && !event.deletedAt) kcGuids.add(event.kcGuid)
    }
    return kcGuids
  })
)

// Unwrapped for a button that must not suspend the section around it: before the events resolve
// nothing is known to be taken, which only loses the early warning — the backend still raises the
// conflict on save — and by the time an event's form is open they have.
export const adminKnownKcGuidsAtom = atomFamily((eventId: string | undefined) =>
  unwrap(adminLinkedKcGuidsAtom(eventId), (previous) => previous ?? new Set<string>())
)

export const adminConfirmedEventAtom = atomFamily((eventId: string | undefined) =>
  atom(async (get): Promise<ConfirmedEvent | null> => {
    const event = await get(adminEventAtom(eventId))
    return isConfirmedEvent(event) ? event : null
  })
)

export const adminCurrentEventAtom = atom(
  // Read through adminEventAtom instead of an `async` getter: an async function returns a new
  // Promise on every call, so each change of adminEventIdAtom would suspend every subscriber and
  // swap the page for its Suspense fallback on every row selection.
  (get) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(adminEventAtom(eventId)) : undefined
  },
  async (get, set, value: DogEvent) => {
    const eventId = get(adminEventIdAtom)
    if (eventId && value) await set(adminEventAtom(eventId), value)
  }
)

/**
 * What the event list search reads for an event: one line per name the event goes by, the Finnish
 * name and each translation (KOE-1453), in the order the list shows its fields. The list shows the
 * name in the UI language, but the search finds an event by its name in any language, and a search
 * may span the name and the fields beside it ("syyskoe vaasa", "autumn trial vaasa") without joining
 * one name's fields to another name. An event without translations reads exactly as it always did.
 */
const searchLines = (event: DogEvent): string[] =>
  [event.name, ...Object.values(event.names ?? {})].map((name) =>
    [event.eventType, name, event.location, event.official?.name, event.secretary?.name]
      .join(' ')
      .toLocaleLowerCase(i18next.language)
  )

export const adminFilteredEventsAtom = atom(async (get) => {
  const events = await get(adminEventsAtom)
  const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
  const showPast = get(adminShowPastEventsAtom)
  return events.filter(
    (event) =>
      !event.deletedAt &&
      (showPast || !event.endDate || !isEventOver(event)) &&
      (!filter || searchLines(event).some((line) => line.includes(filter)))
  )
})

export const adminEventOrganizersAtom = atom(async (get) => {
  const events = await get(adminEventsAtom)
  const organizers = events
    .map((event) => event.organizer)
    .filter((organizer): organizer is PublicOrganizer => !!organizer?.id && !!organizer.name)
  return uniqueFn(organizers, (a, b) => a.id === b.id).sort(compareByLocalizedString('name'))
})
