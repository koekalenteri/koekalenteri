import type { RESET } from 'jotai/utils'
import type { DogEvent, RegistrationClass } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { uniqueClasses } from '../../../../lib/event'
import { atomWithSessionStorage } from '../../../state'
import { adminCurrentEventAtom, adminEventAtom } from './derivedAtoms'

const storedEventClassAtom = atomWithSessionStorage<RegistrationClass | undefined>('adminEventClass', undefined)
export const adminEventClassAtom = atom(
  async (get) => get(storedEventClassAtom) ?? uniqueClasses(await get(adminCurrentEventAtom))[0],
  (_get, set, value: RegistrationClass) => set(storedEventClassAtom, value)
)

export const adminEditableEventByIdAtom = atomFamily((eventId: string) => {
  const storedAtom = atomWithSessionStorage<DogEvent | undefined>(`adminEditableEvent/Id__${eventId}`, undefined)
  return atom(
    async (get) => get(storedAtom) ?? (await get(adminEventAtom(eventId))),
    async (
      get,
      set,
      value: DogEvent | undefined | typeof RESET | ((previous: DogEvent | undefined) => DogEvent | undefined)
    ) => {
      if (typeof value !== 'function') return set(storedAtom, value)
      return set(storedAtom, value(get(storedAtom) ?? (await get(adminEventAtom(eventId)))))
    }
  )
})
