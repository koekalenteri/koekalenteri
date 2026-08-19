import type { ConfirmedEvent, DogEvent, PublicOrganizer } from '../../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { isEventOver } from '../../../../lib/event'
import { isConfirmedEvent } from '../../../../lib/typeGuards'
import { uniqueFn } from '../../../../lib/utils'
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
    async (get, set, value: DogEvent) => {
      if (!value) return
      const events = await get(adminEventsAtom)
      const index = events.findIndex((event) => event.id === eventId)
      const next = [...events]
      const insert = index === -1
      next.splice(insert ? next.length : index, insert ? 0 : 1, value)
      set(adminEventsAtom, next)
    }
  )
)

export const adminConfirmedEventAtom = atomFamily((eventId: string | undefined) =>
  atom(async (get): Promise<ConfirmedEvent | null> => {
    const event = await get(adminEventAtom(eventId))
    return isConfirmedEvent(event) ? event : null
  })
)

export const adminCurrentEventAtom = atom(
  async (get) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? await get(adminEventAtom(eventId)) : undefined
  },
  async (get, set, value: DogEvent) => {
    const eventId = get(adminEventIdAtom)
    if (eventId && value) await set(adminEventAtom(eventId), value)
  }
)

export const adminFilteredEventsAtom = atom(async (get) => {
  const events = await get(adminEventsAtom)
  const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
  const showPast = get(adminShowPastEventsAtom)
  return events.filter(
    (event) =>
      !event.deletedAt &&
      (showPast || !event.endDate || !isEventOver(event)) &&
      (!filter ||
        [event.eventType, event.name, event.location, event.official?.name, event.secretary?.name]
          .join(' ')
          .toLocaleLowerCase(i18next.language)
          .includes(filter))
  )
})

export const adminEventOrganizersAtom = atom(async (get) => {
  const events = await get(adminEventsAtom)
  const organizers = events
    .map((event) => event.organizer)
    .filter((organizer): organizer is PublicOrganizer => !!organizer?.id && !!organizer.name)
  return uniqueFn(organizers, (a, b) => a.id === b.id).sort(compareByLocalizedString('name'))
})
