import type { Registration } from 'koekalenteri-shared/model'

import { atom, atomFamily } from 'recoil'

import { emptyBreeder, emptyDog, emptyPerson } from '../../../components/RegistrationForm'
import { logEffect, storageEffect } from '../../../recoil'

import { remoteRegistrationsEffect } from './effects'
import { currentAdminEventRegistrationSelector } from './selectors'

export const adminRegistrationIdAtom = atom<string | undefined>({
  key: 'adminRegistrationId',
  default: undefined,
  effects: [logEffect, storageEffect],
})

export const eventRegistrationsAtom = atomFamily<Registration[], string>({
  key: 'eventRegistrations',
  effects: [logEffect, remoteRegistrationsEffect],
})

export const editableCurrentAdminEventRegistrationByIdAtom = atomFamily<Registration | undefined, string>({
  key: 'editableCurrentAdminEventRegistration/Id',
  default: currentAdminEventRegistrationSelector,
  effects: [logEffect, storageEffect],
})

export const adminNewRegistrationAtom = atom<Registration | undefined>({
  key: 'adminNewRegistration',
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
