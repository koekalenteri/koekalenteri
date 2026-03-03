import type { Language } from '../../../types'

import { atom, atomFamily } from 'recoil'

import { localStorageEffect, logEffect, sessionStorageEffect } from '../effects'

import { i18nextEffect } from './effects'

export const accessTokenAtom = atom<string | undefined>({
  key: 'accessToken',
  // The actual token is populated by:
  // - `localStorageEffect` (persisted token), and/or
  // - Auth0 bridge in [`AuthProvider`](src/auth/AuthProvider.tsx:26)
  default: undefined,
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

/**
 * Used to force-refresh the userSelector after mutations (e.g. updating own name).
 */
export const userRefreshAtom = atom<number>({
  key: 'userRefresh',
  default: 0,
})

export const openedEventAtom = atomFamily<boolean, string>({
  key: 'open/eventId',
  default: false,
  effects: [sessionStorageEffect],
})
