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
    return atom(
      async (get) => get(storedAtom) ?? (await get(adminEventRegistrationAtom(ids))),
      async (
        get,
        set,
        value:
          | Registration
          | undefined
          | typeof RESET
          | ((previous: Registration | undefined) => Registration | undefined)
      ) => {
        if (typeof value !== 'function') return set(storedAtom, value)
        const previous = get(storedAtom) ?? (await get(adminEventRegistrationAtom(ids)))
        return set(storedAtom, value(previous))
      }
    )
  },
  (left, right) => left.eventId === right.eventId && left.id === right.id
)
