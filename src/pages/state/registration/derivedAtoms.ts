import type { Registration } from '../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { registrationByIdsAtom } from './atoms'

export const registrationAtom = atomFamily((id: string | undefined) =>
  atom(
    (get) => (id ? get(registrationByIdsAtom(id)) : undefined),
    (
      get,
      set,
      value:
        | Registration
        | undefined
        | null
        | ((previous: Registration | undefined | null) => Registration | undefined | null)
    ) => {
      if (!id) return
      if (typeof value === 'function') {
        const previous = get(registrationByIdsAtom(id))
        return previous instanceof Promise
          ? previous.then((resolved) => set(registrationByIdsAtom(id), value(resolved)))
          : set(registrationByIdsAtom(id), value(previous))
      } else if (value) void set(registrationByIdsAtom(id), value)
    }
  )
)
