import { Registration, RegistrationGroup } from "koekalenteri-shared/model"
import { atom, atomFamily } from "recoil"

import { getRegistrations } from "../../../../api/registration"
import { logEffect, storageEffect } from "../../../recoil"


export interface RegistrationWithMutators extends Registration {
  setGroup: (group?: RegistrationGroup) => void
}

export const adminRegistrationIdAtom = atom<string | undefined>({
  key: 'adminRegistrationId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const eventRegistrationsAtom = atomFamily<Registration[], string>({
  key: 'eventRegistrations',
  default: (eventId) => getRegistrations(eventId),
  effects: [
    logEffect,
    storageEffect,
  ],
})
