import type { Judge } from '../../../../types'

import { atom } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteJudgesEffect } from './effects'

export const adminJudgesAtom = atom<Judge[]>({
  key: 'adminJudges',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteJudgesEffect],
})

export const adminJudgeFilterAtom = atom<string>({
  key: 'adminJudgeFilter',
  default: '',
})
