import type { Official } from '../../../../types'

import { atom } from 'recoil'

import { localStorageEffect, logEffect } from '../../../recoil/effects'

import { remoteOfficialsEffect } from './effects'

export const officialsAtom = atom<Official[]>({
  key: 'officials',
  default: [],
  effects: [logEffect, localStorageEffect, remoteOfficialsEffect],
})

export const officialFilterAtom = atom<string>({
  key: 'officialFilter',
  default: '',
})
