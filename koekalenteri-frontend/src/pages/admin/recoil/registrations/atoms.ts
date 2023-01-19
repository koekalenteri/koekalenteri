import { Registration } from 'koekalenteri-shared/model'
import { atom, atomFamily } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil'

import { remoteRegistrationsEffect } from './effects'


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
  effects: [
    logEffect,
    remoteRegistrationsEffect,
  ],
})
