import type { Language } from '../../../types'

import { fetchAuthSession } from 'aws-amplify/auth'
import { atom, atomFamily } from 'recoil'

import { logEffect, storageEffect, stringStorageEffect } from '../effects'

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
  effects: [logEffect, storageEffect],
})

export const languageAtom = atom<Language>({
  key: 'language',
  default: 'fi',
  effects: [logEffect, stringStorageEffect<Language>('fi'), i18nextEffect],
})

export const spaAtom = atom<boolean>({
  key: 'spa',
  default: false,
})

export const loginPathAtom = atom<string | undefined>({
  key: 'loginPath',
  default: '/',
  effects: [logEffect, storageEffect],
})

export const openedEventAtom = atomFamily<boolean, string>({
  key: 'open/eventId',
  default: false,
  effects: [
    ({ node, setSelf, onSet }) => {
      const stored = sessionStorage.getItem(node.key)
      setSelf(stored !== null)

      onSet((newValue, oldValue) => {
        if (newValue) {
          sessionStorage.setItem(node.key, 'true')
        } else if (oldValue) {
          sessionStorage.removeItem(node.key)
        }
      })

      const handleStorageChange = (e: StorageEvent) => {
        if (e.storageArea === sessionStorage && e.key === node.key) {
          setSelf(e.newValue === 'true')
        }
      }

      window.addEventListener('storage', handleStorageChange)

      return () => window.removeEventListener('storage', handleStorageChange)
    },
  ],
})
