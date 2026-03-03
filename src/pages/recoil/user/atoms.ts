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
  default: getIdToken(),
  effects: [logEffect, localStorageEffect],
  key: 'idToken',
})

export const languageAtom = atom<Language>({
  default: 'fi',
  effects: [logEffect, localStorageEffect, i18nextEffect],
  key: 'language',
})

export const spaAtom = atom<boolean>({
  default: false,
  key: 'spa',
})

export const loginPathAtom = atom<string | undefined>({
  default: '/',
  effects: [logEffect, sessionStorageEffect],
  key: 'loginPath',
})

/**
 * Used to force-refresh the userSelector after mutations (e.g. updating own name).
 */
export const userRefreshAtom = atom<number>({
  default: 0,
  key: 'userRefresh',
})

export const openedEventAtom = atomFamily<boolean, string>({
  default: false,
  effects: [sessionStorageEffect],
  key: 'open/eventId',
})
