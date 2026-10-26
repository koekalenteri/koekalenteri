import type { RESET } from 'jotai/utils'
import type { DogEvent, JsonDogEvent, RegistrationClass } from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { uniqueClasses } from '@/lib/event'
import { mapMaybe } from '@/lib/maybePromise'
import { toDogEvent } from '@/lib/wire'
import { atomWithSessionStorage } from '@/pages/state'
import { adminCurrentEventAtom, adminEventAtom } from './derivedAtoms'

const storedEventClassAtom = atomWithSessionStorage<RegistrationClass | undefined>('adminEventClass', undefined)
// Only await adminCurrentEventAtom for the initial default. Once storedEventClassAtom holds a
// value, read synchronously instead of via an `async` getter: an async function always returns
// a new Promise identity on every call, and since storedEventClassAtom changes whenever the
// user picks a class, that would make Suspense re-throw (and remount the page) on every pick.
export const adminEventClassAtom = atom(
  (get) => {
    const stored = get(storedEventClassAtom)
    if (stored !== undefined) return stored
    return mapMaybe(get(adminCurrentEventAtom), (event) => uniqueClasses(event)[0])
  },
  (_get, set, value: RegistrationClass) => set(storedEventClassAtom, value)
)

export const adminEditableEventByIdAtom = atomFamily((eventId: string) => {
  const storedAtom = atomWithSessionStorage<DogEvent | undefined, JsonDogEvent>(
    `adminEditableEvent/Id__${eventId}`,
    undefined,
    { revive: toDogEvent }
  )
  return atom(
    // Only await the initial hydration from adminEventAtom. Once storedAtom holds a value,
    // read synchronously instead of via an `async` getter: an async function always returns a
    // new Promise identity on every call, and since storedAtom changes on every keystroke while
    // editing, that would make Suspense re-throw (and remount the whole form) on every keystroke.
    (get) => {
      const stored = get(storedAtom)
      return stored ?? get(adminEventAtom(eventId))
    },
    (_get, set, value: DogEvent | typeof RESET) => set(storedAtom, value)
  )
})
