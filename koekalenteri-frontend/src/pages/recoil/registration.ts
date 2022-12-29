import { Registration } from "koekalenteri-shared/model"
import { atom, selector } from "recoil"

import { getRegistration } from "../../api/event"

import { logEffect, storageEffect } from "./effects"
import { eventIdAtom } from "./events"


export const registrationIdAtom = atom<string | undefined>({
  key: 'registrationId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const registrationQuery = selector<Registration | undefined>({
  key: 'registration',
  get: ({ get }) => {
    const eventId = get(eventIdAtom)
    const registrationId = get(registrationIdAtom)
    if (eventId && registrationId) {
      return getRegistration(eventId, registrationId)
    }
  },
})
