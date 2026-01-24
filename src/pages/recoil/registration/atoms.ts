import type { Registration } from '../../../types'
import { atom, atomFamily } from 'recoil'
import { emptyBreeder, emptyDog, emptyPerson } from '../../../lib/data'
import { logEffect, sessionStorageEffect } from '../effects'
import { remoteRegistrationEffect } from './effects'

export const newRegistrationAtom = atom<Registration | undefined>({
  default: {
    agreeToTerms: false,
    breeder: { ...emptyBreeder },
    createdAt: new Date(),
    createdBy: 'anonymous',
    dates: [],
    dog: { ...emptyDog },
    eventId: '',
    eventType: '',
    handler: { ...emptyPerson },
    id: '',
    language: 'fi',
    modifiedAt: new Date(),
    modifiedBy: 'anonymous',
    notes: '',
    owner: { ...emptyPerson },
    ownerHandles: true,
    ownerPays: true,
    payer: { ...emptyPerson },
    qualifies: false,
    qualifyingResults: [],
    reserve: 'DAY',
    state: 'creating',
  },
  effects: [logEffect, sessionStorageEffect],
  key: 'newRegistration',
})

export const registrationByIdsAtom = atomFamily<Registration | undefined | null, string>({
  default: undefined,
  effects: (param) => [logEffect, sessionStorageEffect, remoteRegistrationEffect(param)],
  key: 'registration/ids',
})
