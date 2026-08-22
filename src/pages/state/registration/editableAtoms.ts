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
  return atom(
    async (get) => get(storedAtom) ?? (await get(registrationAtom(ids))),
    async (
      get,
      set,
      value:
        | Registration
        | undefined
        | null
        | typeof RESET
        | ((previous: Registration | undefined | null) => Registration | undefined | null)
    ) => {
      if (typeof value !== 'function') return set(storedAtom, value)
      return set(storedAtom, value(get(storedAtom) ?? (await get(registrationAtom(ids)))))
    }
  )
})
