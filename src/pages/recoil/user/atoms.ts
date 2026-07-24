import type { Language } from '../../../types'
import { atom, atomFamily } from 'recoil'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../effects'
import { i18nextEffect, idTokenLogEffect } from './effects'

export const idTokenAtom = atom<string | undefined>({
  default: undefined,
  effects: [idTokenLogEffect, localStorageEffect],
  key: 'idToken',
})

export const tokenValidityRevisionAtom = atom<number>({
  default: 0,
  key: 'idToken/validityRevision',
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
