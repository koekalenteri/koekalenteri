
import { Language } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, stringStorageEffect } from '../effects'

import { i18nextEffect } from './effects'

export const languageAtom = atom<Language>({
  key: 'language',
  default: 'fi',
  effects: [
    logEffect,
    stringStorageEffect<Language>('fi'),
    i18nextEffect,
  ],
})

export const spaAtom = atom<boolean>({
  key: 'spa',
  default: false,
})
