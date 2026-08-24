import type { RESET } from 'jotai/utils'
import type { Registration } from '../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithSessionStorage } from '../storage'
import { registrationAtom } from './derivedAtoms'

export const editableRegistrationByIdsAtom = atomFamily((ids: string | undefined) => {
  const storedAtom = atomWithSessionStorage<Registration | undefined | null>(
    `editableRegistration/ids__${ids}`,
    undefined
  )
  // Only await the initial hydration from registrationAtom. Once storedAtom holds a value, read
  // synchronously instead of via an `async` getter: an async function always returns a new
  // Promise identity on every call, and since storedAtom changes on every keystroke while
  // editing, that would make Suspense re-throw (and remount the whole page) on every keystroke.
  return atom(
    (get) => get(storedAtom) ?? get(registrationAtom(ids)),
    (_get, set, value: Registration | undefined | null | typeof RESET) => set(storedAtom, value)
  )
})
