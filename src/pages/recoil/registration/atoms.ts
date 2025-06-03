import type { Registration } from '../../../types'

import { atom, atomFamily } from 'recoil'

import { emptyBreeder, emptyDog, emptyPerson } from '../../../lib/data'
import { logEffect, sessionStorageEffect } from '../effects'

import { remoteRegistrationEffect } from './effects'
import { registrationSelector } from './selectors'

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
    ownerPays: true,
    payer: { ...emptyPerson },
    qualifyingResults: [],
    qualifies: false,
    reserve: 'DAY',
    state: 'creating',
  },
  effects: [logEffect, sessionStorageEffect],
})

export const registrationByIdsAtom = atomFamily<Registration | undefined | null, string>({
  key: 'registration/ids',
  default: undefined,
  effects: (param) => [logEffect, sessionStorageEffect, remoteRegistrationEffect(param)],
})

export const editableRegistrationByIdsAtom = atomFamily<Registration | undefined | null, string | undefined>({
  key: 'editableRegistration/ids',
  default: registrationSelector,
  effects: [logEffect, sessionStorageEffect],
})
