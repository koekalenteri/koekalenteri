import type { SetStateAction } from 'jotai'
import { atom } from 'jotai'
import { atomWithLazy, RESET } from 'jotai/utils'
import { parseJSON } from '@/lib/utils'
import { runCleaners } from './cleaners'

runCleaners()

interface StorageAtomOptions<T, J = unknown> {
  getInitialValue?: () => T
  /**
   * The stored value's model from its JSON shape (`lib/wire.ts`, KOE-1546): a value with Dates goes
   * into storage as JSON and comes back with ISO strings, like a response from the API. Runs before
   * `refine`, and never writes the storage back on its own.
   */
  revive?: (stored: J) => T
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

/** The stored value as the model, or `undefined` for a value the converter cannot read. */
const reviveStored = <T, J>(parsed: unknown, revive?: (stored: J) => T): unknown => {
  if (!revive || parsed === null || typeof parsed !== 'object') return parsed
  try {
    // JSON.parse gave an object; the converter names the wire shape it reads, which is this one.
    return revive(parsed as J)
  } catch {
    return undefined
  }
}

export const atomWithStoredValue = <T, J = unknown>(
  key: string,
  initialValue: T,
  storage: Storage,
  options?: StorageAtomOptions<T, J>
) => {
  const fallback = () => options?.getInitialValue?.() ?? initialValue
  const readStoredValue = () => {
    const parsed = parseStorageJSON(storage.getItem(key))
    if (parsed === undefined) return fallback()
    const revived = reviveStored(parsed, options?.revive)
    if (revived === undefined) {
      storage.removeItem(key)
      return fallback()
    }
    const refined = options?.refine ? options.refine(revived) : (revived as T)
    if (refined === undefined) {
      storage.removeItem(key)
      options?.onRefined?.()
      return fallback()
    }
    // Compared with the revived value: a conversion always builds a new object, and is not a refinement.
    if (refined !== revived) {
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

export const atomWithLocalStorage = <T, J = unknown>(
  key: string,
  initialValue: T,
  options?: StorageAtomOptions<T, J>
) => atomWithStoredValue(key, initialValue, localStorage, options)

export const atomWithSessionStorage = <T, J = unknown>(
  key: string,
  initialValue: T,
  options?: StorageAtomOptions<T, J>
) => atomWithStoredValue(key, initialValue, sessionStorage, options)
