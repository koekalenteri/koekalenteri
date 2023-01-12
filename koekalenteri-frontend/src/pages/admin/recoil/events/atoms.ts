import { addDays, startOfDay, sub } from "date-fns"
import { Event } from "koekalenteri-shared/model"
import { atom, atomFamily, selector } from "recoil"

import { uniqueClasses } from "../../../../utils"
import { logEffect, storageEffect } from "../../../recoil"

import { remoteAdminEventsEffect } from "./effects"
import { adminEventSelector, currentAdminEventSelector } from "./selectors"

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

/**
 * Existing event editing, edits stored to local storage
 */
export const editableEventByIdAtom = atomFamily<Event | undefined, string>({
  key: 'editableEvent/Id',
  default: adminEventSelector,
  effects: [
    logEffect,
    storageEffect,
  ],
})
