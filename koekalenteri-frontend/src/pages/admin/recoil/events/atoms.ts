import { addDays, startOfDay, sub } from "date-fns"
import { Event } from "koekalenteri-shared/model"
import { atom, atomFamily, selector } from "recoil"

import { getEvent } from "../../../../api/event"
import { uniqueClasses } from "../../../../utils"
import { logEffect, parseStorageJSON, storageEffect } from "../../../recoil"

import { remoteAdminEventsEffect } from "./effects"
import { currentAdminEventSelector } from "./selectors"

export const adminEventsAtom = atom<Event[]>({
  key: 'adminEvents',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteAdminEventsEffect,
  ],
})

export const newEventAtom = atom<Event>({
  key: 'newEvent',
  default: {
    state: 'draft',
    startDate: startOfDay(addDays(Date.now(), 90)),
    endDate: startOfDay(addDays(Date.now(), 90)),
    entryStartDate: sub(startOfDay(addDays(Date.now(), 90)), { weeks: 6 }),
    entryEndDate: sub(startOfDay(addDays(Date.now(), 90)), { weeks: 3 }),
    classes: [],
    judges: [],
  } as unknown as Event,
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
    get: ({ get }) => uniqueClasses(get(currentAdminEventSelector))[0],
  }),
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const eventStorageKey = (eventId: string) => `adminEditEvent/eventId-${eventId}`

/**
 * Existing event editing, edits stored to local storage
 */
export const editableEventByIdAtom = atomFamily<Event | undefined, string>({
  key: 'editableEvent/Id',
  default: undefined,
  effects: eventId => [
    ({ node, setSelf, onSet, getPromise }) => {
      const key = eventStorageKey(eventId)

      const savedValue = localStorage.getItem(key)
      if (savedValue !== null) {
        const parsed = parseStorageJSON(savedValue)
        setSelf(parsed)
      } else {
        getEvent(eventId).then(setSelf)
      }

      onSet(async (newValue, _, isReset) => {
        if (isReset || newValue === null || newValue === undefined) {
          localStorage.removeItem(key)
          setSelf(undefined)
        } else {
          localStorage.setItem(key, JSON.stringify(newValue))
        }
      })
    },
  ],
})
