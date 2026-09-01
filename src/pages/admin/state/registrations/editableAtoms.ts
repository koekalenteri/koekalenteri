import type { RESET } from 'jotai/utils'
import type { Registration } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithSessionStorage } from '../../../state'
import { adminEventRegistrationAtom } from './derivedAtoms'

export const adminEditableEventRegistrationByEventIdAndIdAtom = atomFamily(
  (ids: { eventId: string; id: string }) => {
    const storedAtom = atomWithSessionStorage<Registration | undefined>(
      `adminEditableEventRegistration/eventId+Id__${ids.eventId}__${ids.id}`,
      undefined
    )
    // Only await the initial hydration from adminEventRegistrationAtom. Once storedAtom holds a
    // value, read synchronously instead of via an `async` getter: an async function always
    // returns a new Promise identity on every call, and since storedAtom changes on every edit,
    // that would make Suspense re-throw (and remount the whole page) on every edit.
    return atom(
      (get) => {
        const stored = get(storedAtom)
        return stored ?? get(adminEventRegistrationAtom(ids))
      },
      (_get, set, value: Registration | undefined | typeof RESET) => set(storedAtom, value)
    )
  },
  (left, right) => left.eventId === right.eventId && left.id === right.id
)
