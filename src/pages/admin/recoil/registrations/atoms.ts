import type { Registration } from '../../../../types'
import { atom, atomFamily } from 'recoil'
import { emptyBreeder, emptyDog, emptyPerson } from '../../../../lib/data'
import { localStorageEffect, logEffect } from '../../../recoil'
import { adminRemoteRegistrationsEffect } from './effects'

export const adminBackgroundActionsRunningAtom = atom<boolean>({
  default: false,
  key: 'adminBackgroundActionsRunningAtom',
})

export const adminRegistrationIdAtom = atom<string | undefined>({
  default: undefined,
  effects: [logEffect, localStorageEffect],
  key: 'adminRegistrationId',
})

export const adminEventRegistrationsAtom = atomFamily<Registration[], string>({
  effects: (eventId) => [logEffect, adminRemoteRegistrationsEffect(eventId)],
  key: 'adminEventRegistrations',
})

export const adminNewRegistrationAtom = atom<Registration | undefined>({
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
    qualifyingResults: [],
    reserve: 'DAY',
  },
  effects: [logEffect, localStorageEffect],
  key: 'adminNewRegistration',
})
