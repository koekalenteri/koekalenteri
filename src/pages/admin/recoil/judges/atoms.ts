import type { Judge } from '../../../../types'
import { atom } from 'recoil'
import { logEffect, sessionStorageEffect } from '../../../recoil/effects'
import { adminRemoteJudgesEffect } from './effects'

export const adminJudgesAtom = atom<Judge[]>({
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteJudgesEffect],
  key: 'adminJudges',
})

export const adminJudgeFilterAtom = atom<string>({
  default: '',
  key: 'adminJudgeFilter',
})
