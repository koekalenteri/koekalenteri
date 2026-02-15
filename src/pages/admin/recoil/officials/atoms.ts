import type { Official } from '../../../../types'
import { atom } from 'recoil'
import { logEffect, sessionStorageEffect } from '../../../recoil/effects'
import { adminRemoteOfficialsEffect } from './effects'

export const adminOfficialsAtom = atom<Official[]>({
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteOfficialsEffect],
  key: 'adminOfficials',
})

export const adminOfficialFilterAtom = atom<string>({
  default: '',
  key: 'adminOfficialFilter',
})
