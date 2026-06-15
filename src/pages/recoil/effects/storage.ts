import type { AtomEffect } from 'recoil'
import { parseJSON } from '../../../lib/utils'
import { runCleaners } from './storageCleaners'

runCleaners()

interface StorageEffectOptions<T> {
  refine?: (value: unknown) => T | undefined
  onRefined?: () => void
}

export const parseStorageJSON = (value: string | null) => {
  try {
    if (value !== null) {
      return parseJSON(value)
    }
  } catch (e) {
    console.warn('JSON parse error', e)
  }
}

const getRefinedValue = <T>(value: unknown, options?: StorageEffectOptions<T>) =>
  options?.refine ? options.refine(value) : (value as T | undefined)

export const getStorageEffect =
  <T = any>(storage: Storage, options?: StorageEffectOptions<T>): AtomEffect<T> =>
  ({ node, setSelf, onSet, trigger, resetSelf }) => {
    if (trigger === 'get') {
      const savedValue = storage.getItem(node.key)
      if (savedValue !== null) {
        const parsed = parseStorageJSON(savedValue)
        if (parsed !== undefined) {
          const refined = getRefinedValue(parsed, options)
          if (refined === undefined) {
            storage.removeItem(node.key)
            options?.onRefined?.()
            return
          }
          if (refined !== parsed) {
            storage.setItem(node.key, JSON.stringify(refined))
            options?.onRefined?.()
          }
          setSelf(refined)
        }
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
        const refined = parsed === undefined ? undefined : getRefinedValue(parsed, options)
        if (refined === undefined) {
          if (parsed !== undefined) {
            storage.removeItem(node.key)
            options?.onRefined?.()
          }
          resetSelf()
        } else {
          if (refined !== parsed) {
            storage.setItem(node.key, JSON.stringify(refined))
            options?.onRefined?.()
          }
          setSelf(refined)
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
