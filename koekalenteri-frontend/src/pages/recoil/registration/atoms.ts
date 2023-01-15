import { Registration } from "koekalenteri-shared/model"
import { atom, atomFamily } from "recoil"

import { emptyBreeder, emptyDog, emptyPerson } from "../../components/RegistrationForm"
import { logEffect, storageEffect } from "../effects"

import { remoteRegistrationEffect } from "./effects"
import { registrationSelector } from "./selectors"


export const registrationIdAtom = atom<string | undefined>({
  key: 'registrationId',
  default: '',
  effects: [
    logEffect,
  ],
})

export const newRegistrationAtom = atom<Registration | undefined>({
  key: 'newRegistration',
  default: {
    id: '',
    createdAt: new Date(),
    createdBy: 'anonymous',
    modifiedAt: new Date(),
    modifiedBy: 'anonymous',
    agreeToPublish: false,
    agreeToTerms: false,
    breeder: {...emptyBreeder},
    dates: [],
    dog: {...emptyDog},
    eventId: '',
    eventType: '',
    handler: {...emptyPerson},
    language: 'fi',
    notes: '',
    owner: {...emptyPerson},
    qualifyingResults: [],
    reserve: '',
  },
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const registrationByIdAtom = atomFamily<Registration | undefined, string>({
  key: 'registration/id',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
    remoteRegistrationEffect,
  ],
})

export const editableRegistrationByIdAtom = atomFamily<Registration | undefined, string | undefined>({
  key: 'editableRegistration/Id',
  default: registrationSelector,
  effects: [
    logEffect,
    storageEffect,
  ],
})


