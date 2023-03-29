import { Registration } from 'koekalenteri-shared/model'
import { atom, atomFamily } from 'recoil'

import { emptyBreeder, emptyDog, emptyPerson } from '../../components/RegistrationForm'
import { logEffect, storageEffect } from '../effects'

import { remoteRegistrationEffect } from './effects'
import { registrationSelector } from './selectors'

export const registrationIdAtom = atom<string | undefined>({
  key: 'registrationId',
  default: '',
  effects: [logEffect],
})

export const newRegistrationAtom = atom<Registration | undefined>({
  key: 'newRegistration',
  default: {
    id: '',
    createdAt: new Date(),
    createdBy: 'anonymous',
    modifiedAt: new Date(),
    modifiedBy: 'anonymous',
    agreeToTerms: false,
    breeder: { ...emptyBreeder },
    dates: [],
    dog: { ...emptyDog },
    eventId: '',
    eventType: '',
    handler: { ...emptyPerson },
    language: 'fi',
    notes: '',
    owner: { ...emptyPerson },
    ownerHandles: true,
    qualifyingResults: [],
    reserve: 'DAY',
  },
  effects: [logEffect, storageEffect],
})

export const registrationByIdsAtom = atomFamily<Registration | undefined | null, string>({
  key: 'registration/ids',
  default: undefined,
  effects: [logEffect, storageEffect, remoteRegistrationEffect],
})

export const editableRegistrationByIdsAtom = atomFamily<Registration | undefined | null, string | undefined>({
  key: 'editableRegistration/ids',
  default: registrationSelector,
  effects: [logEffect, storageEffect],
})
