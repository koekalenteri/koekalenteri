import type { Registration } from '../../../../types'

import { atom, atomFamily } from 'recoil'

import { emptyBreeder, emptyDog, emptyPerson } from '../../../../lib/data'
import { localStorageEffect, logEffect } from '../../../recoil'

import { adminRemoteRegistrationsEffect } from './effects'

export const adminBackgroundActionsRunningAtom = atom<boolean>({
  key: 'adminBackgroundActionsRunningAtom',
  default: false,
})

export const adminRegistrationIdAtom = atom<string | undefined>({
  key: 'adminRegistrationId',
  default: undefined,
  effects: [logEffect, localStorageEffect],
})

export const adminEventRegistrationsAtom = atomFamily<Registration[], string>({
  key: 'adminEventRegistrations',
  effects: (eventId) => [logEffect, adminRemoteRegistrationsEffect(eventId)],
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
    payer: { ...emptyPerson },
    ownerHandles: true,
    ownerPays: true,
    qualifyingResults: [],
    reserve: 'DAY',
  },
  effects: [logEffect, localStorageEffect],
})
