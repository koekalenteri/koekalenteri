import type { AtomEffect } from 'recoil'

import { parseJSON } from '../../../lib/utils'

import { runCleaners } from './storageCleaners'

runCleaners()

export const parseStorageJSON = (value: string | null) => {
  try {
    if (value !== null) {
      return parseJSON(value)
    }
  } catch (e) {
    console.warn('JSON parse error', e)
  }
}

export const getStorageEffect =
  (storage: Storage): AtomEffect<any> =>
  ({ node, setSelf, onSet, trigger, resetSelf }) => {
    if (trigger === 'get') {
      const savedValue = storage.getItem(node.key)
      if (savedValue !== null) {
        setSelf(parseStorageJSON(savedValue))
      }
    }

    onSet((newValue, _, isReset) => {
      if (document.visibilityState !== 'visible') {
        console.info(`Preventing change from invisible window to storage. Key: ${node.key}`)
        return
      }

      if (isReset || newValue === null || newValue === undefined) {
        storage.removeItem(node.key)
      } else {
        storage.setItem(node.key, JSON.stringify(newValue))
      }
    })

    const handleStorageChange = (e: StorageEvent) => {
      if (e.storageArea === storage && e.key === node.key) {
        const parsed = parseStorageJSON(e.newValue)
        if (parsed === undefined) {
          resetSelf()
        } else {
          setSelf(parsed)
        }
      }
    }

    globalThis.addEventListener('storage', handleStorageChange)

    return () => {
      globalThis.removeEventListener('storage', handleStorageChange)
    }
  }

export const localStorageEffect = getStorageEffect(localStorage)
export const sessionStorageEffect = getStorageEffect(sessionStorage)
