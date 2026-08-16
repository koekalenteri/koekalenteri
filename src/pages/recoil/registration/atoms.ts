import type { Registration } from '../../../types'
import { atom, atomFamily } from 'recoil'
import { createRegistrationDraft } from '../../../lib/registration'
import { logEffect, sessionStorageEffect } from '../effects'
import { remoteRegistrationEffect } from './effects'

export const createNewRegistration = (): Registration => createRegistrationDraft('participant')

export const newRegistrationAtom = atom<Registration | undefined>({
  default: createNewRegistration(),
  effects: [logEffect, sessionStorageEffect],
  key: 'newRegistration',
})

export const registrationByIdsAtom = atomFamily<Registration | undefined | null, string>({
  default: undefined,
  effects: (param) => [logEffect, sessionStorageEffect, remoteRegistrationEffect(param)],
  key: 'registration/ids',
})
