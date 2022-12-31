import { atom, selector } from "recoil"

import { logEffect, storageEffect } from "../../../recoil"

import { DecoratedEvent, remoteAdminEventsEffect } from "./effects"
import { currentAdminEventQuery } from "./selectors"

export const adminEventsAtom = atom<DecoratedEvent[]>({
  key: 'adminEvents',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteAdminEventsEffect,
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
    get: ({ get }) => get(currentAdminEventQuery)?.uniqueClasses?.[0],
  }),
  effects: [
    logEffect,
    storageEffect,
  ],
})
