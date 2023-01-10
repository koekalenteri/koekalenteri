import { startOfToday } from "date-fns"
import i18next from "i18next"
import { Event } from "koekalenteri-shared/model"
import { DefaultValue, selector, selectorFamily } from "recoil"

import { adminEventFilterTextAtom, adminEventIdAtom, adminEventsAtom, adminShowPastEventsAtom, editableEventByIdAtom, eventStorageKey, newEventAtom } from "./atoms"


export const currentAdminEventSelector = selector({
  key: 'currentAdminEvent',
  get: ({ get }) => {
    const eventId = get(adminEventIdAtom)
    return eventId ? get(editableEventByIdAtom(eventId)) : undefined
  },
  set: ({ set }, newValue) => {
    if (!newValue || newValue instanceof DefaultValue) {
      return
    }
    set(editableEventByIdAtom(newValue.id), newValue)
  },
})

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

/**
 * Abstration for new / existing event
 */
export const editableEventSelector = selectorFamily<Event | undefined, string|undefined>({
  key: 'editableEvent',
  get: (eventId) => ({ get }) => eventId ? get(editableEventByIdAtom(eventId)) : get(newEventAtom),
  set: (eventId) => ({ set, reset }, newValue) => {
    if (eventId) {
      set(editableEventByIdAtom(eventId), newValue)
    } else if (newValue) {
      set(newEventAtom, newValue)
    } else {
      reset(newEventAtom)
    }
  },
})

/**
 * Abstraction for new / existing event modified status
 */
export const editableEventModifiedSelector = selectorFamily<boolean, string|undefined>({
  key: 'editableEvent/modified',
  get: (eventId) => ({ get }) => {
    if (eventId) {
      const stored = localStorage.getItem(eventStorageKey(eventId))
      return stored !== null
    } else {
      const value = get(newEventAtom)
      return !(value instanceof DefaultValue)
    }
  },
})
