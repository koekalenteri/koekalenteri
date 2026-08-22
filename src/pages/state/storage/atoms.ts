import type { SetStateAction } from 'jotai'
import { atom } from 'jotai'
import { atomWithLazy, RESET } from 'jotai/utils'
import { parseJSON } from '../../../lib/utils'
import { runCleaners } from './cleaners'

runCleaners()

interface StorageAtomOptions<T> {
  getInitialValue?: () => T
  refine?: (value: unknown) => T | undefined
  onRefined?: () => void
}

export const parseStorageJSON = (value: string | null) => {
  try {
    if (value !== null) return parseJSON(value)
  } catch (error) {
    console.warn('JSON parse error', error)
  }
}

export const atomWithStoredValue = <T>(
  key: string,
  initialValue: T,
  storage: Storage,
  options?: StorageAtomOptions<T>
) => {
  const fallback = () => options?.getInitialValue?.() ?? initialValue
  const readStoredValue = () => {
    const parsed = parseStorageJSON(storage.getItem(key))
    if (parsed === undefined) return fallback()
    const refined = options?.refine ? options.refine(parsed) : (parsed as T)
    if (refined === undefined) {
      storage.removeItem(key)
      options?.onRefined?.()
      return fallback()
    }
    if (refined !== parsed) {
      storage.setItem(key, JSON.stringify(refined))
      options?.onRefined?.()
    }
    return refined
  }

  const valueAtom = atomWithLazy(readStoredValue)
  const storedAtom = atom(
    (get) => get(valueAtom),
    (get, set, update: SetStateAction<T> | typeof RESET) => {
      if (update === RESET) {
        set(valueAtom, fallback())
        storage.removeItem(key)
        return
      }
      const value = typeof update === 'function' ? (update as (previous: T) => T)(get(valueAtom)) : update
      set(valueAtom, value)
      if (document.visibilityState !== 'visible') {
        console.info(`Preventing change from invisible window to storage. Key: ${key}`)
      } else if (value === null || value === undefined) {
        storage.removeItem(key)
      } else {
        storage.setItem(key, JSON.stringify(value))
      }
    }
  )

  storedAtom.onMount = (setValue) => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea === storage && event.key === key) setValue(readStoredValue())
    }
    globalThis.addEventListener('storage', handleStorageChange)
    return () => globalThis.removeEventListener('storage', handleStorageChange)
  }
  return storedAtom
}

export const atomWithLocalStorage = <T>(key: string, initialValue: T, options?: StorageAtomOptions<T>) =>
  atomWithStoredValue(key, initialValue, localStorage, options)

export const atomWithSessionStorage = <T>(key: string, initialValue: T, options?: StorageAtomOptions<T>) =>
  atomWithStoredValue(key, initialValue, sessionStorage, options)
