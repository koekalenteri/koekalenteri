import { addDays, startOfDay, sub } from "date-fns"
import { atom, atomFamily, selector } from "recoil"

import { logEffect, parseStorageJSON, storageEffect } from "../../../recoil"

import { DecoratedEvent, remoteAdminEventsEffect } from "./effects"
import { adminEventByIdSelector, currentAdminEventSelector } from "./selectors"

export const adminEventsAtom = atom<DecoratedEvent[]>({
  key: 'adminEvents',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteAdminEventsEffect,
  ],
})

export const newEventAtom = atom<DecoratedEvent>({
  key: 'newEvent',
  default: {
    state: 'draft',
    startDate: startOfDay(addDays(Date.now(), 90)),
    endDate: startOfDay(addDays(Date.now(), 90)),
    entryStartDate: sub(startOfDay(addDays(Date.now(), 90)), { weeks: 6 }),
    entryEndDate: sub(startOfDay(addDays(Date.now(), 90)), { weeks: 3 }),
    classes: [],
    judges: [],
  } as unknown as DecoratedEvent,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const adminShowPastEventsAtom = atom<boolean>({
  key: 'adminShowPastEvents',
  default: false,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const adminEventFilterTextAtom = atom<string>({
  key: 'adminEventFilterText',
  default: '',
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const adminEventIdAtom = atom<string | undefined>({
  key: 'adminEventId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const eventClassAtom = atom<string | undefined>({
  key: 'eventClass',
  default: selector({
    key: 'eventClass/default',
    get: ({ get }) => get(currentAdminEventSelector)?.uniqueClasses?.[0],
  }),
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const adminEditEventByIdAtom = atomFamily<DecoratedEvent | undefined, string>({
  key: 'adminEditEvent/eventId',
  default: undefined,
  effects: eventId => [
    ({ node, setSelf, onSet, getPromise }) => {
      const key = `${node.key}-${eventId}`

      const savedValue = localStorage.getItem(key)
      if (savedValue !== null) {
        const parsed = parseStorageJSON(savedValue)
        console.log('from storage', eventId)
        setSelf(parsed)
      } else {
        console.log('from data', eventId)
        setSelf(getPromise(adminEventByIdSelector(eventId)))
      }

      onSet((newValue, _, isReset) => {
        if (isReset || newValue === null || newValue === undefined) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, JSON.stringify(newValue))
        }
      })
    },
  ],
})
