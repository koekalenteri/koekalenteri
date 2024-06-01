import type { Language } from '../../../types'

import { fetchAuthSession } from 'aws-amplify/auth'
import { atom, atomFamily } from 'recoil'

import { localStorageEffect, logEffect, sessionStorageEffect } from '../effects'

import { i18nextEffect } from './effects'

const getIdToken = async (): Promise<string | undefined> => {
  try {
    const session = await fetchAuthSession()
    return session.tokens?.idToken?.toString()
  } catch (e) {
    console.error('getIdToken', e)
    return
  }
}

export const idTokenAtom = atom<string | undefined>({
  key: 'idToken',
  default: getIdToken(),
  effects: [logEffect, localStorageEffect],
})

export const languageAtom = atom<Language>({
  key: 'language',
  default: 'fi',
  effects: [logEffect, localStorageEffect, i18nextEffect],
})

export const spaAtom = atom<boolean>({
  key: 'spa',
  default: false,
})

export const loginPathAtom = atom<string | undefined>({
  key: 'loginPath',
  default: '/',
  effects: [logEffect, sessionStorageEffect],
})

export const openedEventAtom = atomFamily<boolean, string>({
  key: 'open/eventId',
  default: false,
  effects: [sessionStorageEffect],
})
