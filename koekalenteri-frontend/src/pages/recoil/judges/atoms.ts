
import { Judge } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../effects'

import { remoteJudgesEffect } from './effects'

export const judgesAtom = atom<Judge[]>({
  key: 'judges',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteJudgesEffect,
  ],
})

export const judgeFilterAtom = atom<string>({
  key: 'judgeFilter',
  default: '',
})
