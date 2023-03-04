import { Language } from 'koekalenteri-shared/model'
import { atom, atomFamily } from 'recoil'

import { logEffect, stringStorageEffect } from '../effects'

import { i18nextEffect } from './effects'

export const languageAtom = atom<Language>({
  key: 'language',
  default: 'fi',
  effects: [logEffect, stringStorageEffect<Language>('fi'), i18nextEffect],
})

export const spaAtom = atom<boolean>({
  key: 'spa',
  default: false,
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
