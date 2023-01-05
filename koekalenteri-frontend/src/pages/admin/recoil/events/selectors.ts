import { startOfToday } from "date-fns"
import i18next from "i18next"
import { DefaultValue, selector, selectorFamily } from "recoil"

import { getEvent } from "../../../../api/event"

import { adminEditEventByIdAtom, adminEventFilterTextAtom, adminEventIdAtom, adminEventsAtom, adminShowPastEventsAtom, newEventAtom } from "./atoms"
import { DecoratedEvent, decorateEvent } from "./effects"


export const filteredAdminEventsSelector = selector({
  key: 'filteredAdminEvents',
  get: ({ get }) => {
    const events = get(adminEventsAtom)
    const filter = get(adminEventFilterTextAtom).toLocaleLowerCase(i18next.language)
    const showPast = get(adminShowPastEventsAtom)

    return events.filter(event => {
      return !event.deletedAt
        && (showPast || !event.startDate || event.startDate >= startOfToday())
        && (!filter || ([event.location, event.official.name, event.secretary.name].join(' ').toLocaleLowerCase(i18next.language).includes(filter)))
    })
  },
})

export const currentAdminEventSelector = selector({
  key: 'currentAdminEvent',
  get: ({ get }) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(adminEventByIdSelector(eventId)) : undefined
  },
  set: ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(adminEventByIdSelector(newValue.id), newValue)
  },
})

export const editAdminEventSelector = selectorFamily<DecoratedEvent | undefined, string|undefined>({
  key: 'editAdminEvent',
  get: (eventId) => ({ get }) => eventId ? get(adminEditEventByIdAtom(eventId)) : get(newEventAtom),
  set: (eventId) => ({ set, reset }, newValue) => {
    if (eventId) {
      set(adminEditEventByIdAtom(eventId), newValue)
    } else if (newValue) {
      set(newEventAtom, newValue)
    } else {
      reset(newEventAtom)
    }
  },
})

export const adminEventByIdSelector = selectorFamily<DecoratedEvent | undefined, string>({
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
