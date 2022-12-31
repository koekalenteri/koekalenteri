import { startOfToday } from "date-fns"
import i18next from "i18next"
import { DefaultValue, selector, selectorFamily } from "recoil"

import { getEvent } from "../../../../api/event"

import { adminEventFilterTextAtom, adminEventIdAtom, adminEventsAtom, adminShowPastEventsAtom } from "./atoms"
import { DecoratedEvent, decorateEvent } from "./effects"


export const filteredAdminEventsQuery = selector({
  key: 'filteredAdminEvents',
  get: ({ get }) => {
    const events = get(adminEventsAtom)
    const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
    const showPast = get(adminShowPastEventsAtom)

    return events.filter(event => {
      return !event.deletedAt
        && (showPast || !event.startDate || event.startDate < startOfToday())
        && (!filter || ([event.location, event.official.name, event.secretary.name].join(' ').toLocaleLowerCase(i18next.language).includes(filter)))
    })
  },
})

export const currentAdminEventQuery = selector({
  key: 'currentAdminEvent',
  get: ({ get }) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(adminEventSelector(eventId)) : undefined
  },
  set: ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(adminEventSelector(newValue.id), newValue)
  },
})

export const adminEventByIdAtom = selectorFamily<DecoratedEvent | undefined, string>({
  key: 'adminEvents/eventId',
  get: (eventId) => async ({ get }) => {
    let event = get(adminEventsAtom).find(event => event.id === eventId)
    if (!event) {
      const fetched = await getEvent(eventId)
      if (fetched) {
        event = decorateEvent(fetched)
      }
    }
    return event
  },
  set: (eventId) => ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(adminEventsAtom, oldEvents => {
      const index = oldEvents.findIndex(item => item.id === eventId)
      const newEvents = oldEvents.map(event => ({ ...event }))
      newEvents.splice(index, 1, newValue)
      return newEvents
    })
  },
})

export const adminEventSelector = selectorFamily<DecoratedEvent | undefined, string>({
  key: 'adminEvent',
  get: (eventId) => ({ get }) => get(adminEventByIdAtom(eventId)),
  set: (eventId) => ({ set }, newValue) => set(adminEventByIdAtom(eventId), newValue),
})
