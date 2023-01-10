
import { Official } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteOfficialsEffect } from './effects'

export const officialsAtom = atom<Official[]>({
  key: 'officials',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteOfficialsEffect,
  ],
})

export const officialFilterAtom = atom<string>({
  key: 'officialFilter',
  default: '',
})
