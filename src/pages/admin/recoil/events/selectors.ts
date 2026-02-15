import type { ConfirmedEvent, DogEvent } from '../../../../types'
import { isPast } from 'date-fns'
import i18next from 'i18next'
import { DefaultValue, selector, selectorFamily } from 'recoil'
import { isConfirmedEvent } from '../../../../lib/typeGuards'
import { uniqueFn } from '../../../../lib/utils'
import {
  adminEventFilterTextAtom,
  adminEventIdAtom,
  adminEventsAtom,
  adminNewEventAtom,
  adminShowPastEventsAtom,
} from './atoms'

export const adminEventSelector = selectorFamily<DogEvent, string | undefined>({
  get:
    (eventId) =>
    ({ get }) => {
      if (!eventId) {
        return get(adminNewEventAtom)
      }
      const events = get(adminEventsAtom)
      return events.find((e) => e.id === eventId) ?? get(adminNewEventAtom)
    },
  key: 'adminEventSelector',
  set:
    (eventId) =>
    ({ get, set }, value) => {
      if (!value || value instanceof DefaultValue) {
        return
      }
      const events = get(adminEventsAtom)
      const index = events.findIndex((e) => e.id === eventId)
      const newEvents = [...events]
      const insert = index === -1
      newEvents.splice(insert ? newEvents.length : index, insert ? 0 : 1, value)
      set(adminEventsAtom, newEvents)
    },
})

export const adminConfirmedEventSelector = selectorFamily<ConfirmedEvent | null, string | undefined>({
  get:
    (eventId) =>
    ({ get }) => {
      const event = get(adminEventSelector(eventId))
      return isConfirmedEvent(event) ? event : null
    },
  key: 'adminConfirmedEventSelector',
})

export const adminCurrentEventSelector = selector({
  get: ({ get }) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(adminEventSelector(eventId)) : undefined
  },
  key: 'adminCurrentEvent',
  set: ({ get, set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    const eventId = get(adminEventIdAtom)
    if (!eventId) {
      return
    }
    set(adminEventSelector(eventId), newValue)
  },
})

export const adminFilteredEventsSelector = selector({
  get: ({ get }) => {
    const events = get(adminEventsAtom)
    const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
    const showPast = get(adminShowPastEventsAtom)

    return events.filter((event) => {
      return (
        !event.deletedAt &&
        (showPast || !event.endDate || !isPast(event.endDate)) &&
        (!filter ||
          [event.eventType, event.name, event.location, event.official?.name, event.secretary?.name]
            .join(' ')
            .toLocaleLowerCase(i18next.language)
            .includes(filter))
      )
    })
  },
  key: 'adminFilteredEvents',
})

export const adminEventOrganizersSelector = selector({
  get: ({ get }) => {
    const events = get(adminEventsAtom)
    return uniqueFn(
      events.map((event) => event.organizer),
      (a, b) => a.id === b.id
    ).sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
  key: 'adminEventOrganizers',
})
