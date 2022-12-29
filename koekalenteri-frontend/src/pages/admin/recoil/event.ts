import { EventEx } from "koekalenteri-shared/model"
import { atom, DefaultValue, selector, selectorFamily } from "recoil"

import { getEvent, getEvents } from "../../../api/event"
import { unique, uniqueDate } from "../../../utils"
import { logEffect, storageEffect } from "../../recoil/effects"

export interface DecoratedEvent extends EventEx {
  uniqueClasses: string[]
  uniqueClassDates: (eventClass: string) => Date[]
}

export const adminEventIdAtom = atom<string | undefined>({
  key: 'adminEventId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const currentAdminEvent = selector({
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

function decorateEvent(event: EventEx): DecoratedEvent {
  return {
    ...event,
    uniqueClasses: unique(event.classes.map(c => c.class)),
    uniqueClassDates: (eventClass: string) => uniqueDate(
      event.classes
        .filter(c => c.class === eventClass)
        .map(c => c.date || event.startDate || new Date()),
    ),
  }
}

export const adminEventsAtom = atom<DecoratedEvent[]>({
  key: 'adminEvents',
  default: getEvents().then(events => events.map(decorateEvent)),
  effects: [
    logEffect,
    storageEffect,
  ],
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
      const newEvents = oldEvents.map(event => ({...event}))
      newEvents.splice(index, 1, newValue)
      return newEvents
    })
  },
})

export const adminEventSelector = selectorFamily<DecoratedEvent | undefined, string>({
  key: 'adminEvent',
  get: (eventId) => ({get}) => get(adminEventByIdAtom(eventId)),
  set: (eventId) => ({set}, newValue) => set(adminEventByIdAtom(eventId), newValue),
})

export const eventClassAtom = atom<string | undefined>({
  key: 'eventClass',
  default: selector({
    key: 'eventClass/default',
    get: ({ get }) => get(currentAdminEvent)?.uniqueClasses?.[0],
  }),
  effects: [
    logEffect,
    storageEffect,
  ],
})
