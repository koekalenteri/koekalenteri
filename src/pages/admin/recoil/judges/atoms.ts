import type { Judge } from '../../../../types'

import { atom } from 'recoil'

import { localStorageEffect, logEffect } from '../../../recoil/effects'

import { remoteJudgesEffect } from './effects'

export const judgesAtom = atom<Judge[]>({
  key: 'judges',
  default: [],
  effects: [logEffect, localStorageEffect, remoteJudgesEffect],
})

export const judgeFilterAtom = atom<string>({
  key: 'judgeFilter',
  default: '',
})
