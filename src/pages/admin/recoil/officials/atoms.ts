import type { Official } from '../../../../types'

import { atom } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteOfficialsEffect } from './effects'

export const adminOfficialsAtom = atom<Official[]>({
  key: 'adminOfficials',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteOfficialsEffect],
})

export const adminOfficialFilterAtom = atom<string>({
  key: 'adminOfficialFilter',
  default: '',
})
