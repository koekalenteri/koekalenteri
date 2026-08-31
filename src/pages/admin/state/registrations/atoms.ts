import type { Registration, RegistrationGroupMove } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { getRegistrations } from '../../../../api/registration'
import { createRegistrationDraft } from '../../../../lib/registration'
import { atomWithLocalStorage } from '../../../state'
import { validIdTokenAtom } from '../../../state/user'

export const adminBackgroundActionsRunningAtom = atom(false)
export const adminEventRegistrationsFetchedAtAtom = atomFamily((_eventId: string) => atom<Date | undefined>(undefined))
export const adminEventRegistrationsCursorAtom = atomFamily((_eventId: string) => atom<Date | undefined>(undefined))
export const adminRegistrationIdAtom = atomWithLocalStorage<string | undefined>('adminRegistrationId', undefined)

export const adminEventRegistrationsAtom = atomFamily((eventId: string) => {
  const remoteAtom = atom(async (get) => {
    const token = get(validIdTokenAtom)
    return token ? ((await getRegistrations(eventId, token)) ?? []) : []
  })
  const overrideAtom = atom<Registration[] | undefined>(undefined)
  return atom(
    (get) => get(overrideAtom) ?? get(remoteAtom),
    (_get, set, value: Registration[] | ((previous: Registration[]) => Registration[])) =>
      set(overrideAtom, (current) => {
        if (typeof value !== 'function') return value
        if (!current) throw new Error('Cannot update registrations before they have loaded')
        return value(current)
      })
  )
})

/** Local-only commands layered over the WebSocket-backed server snapshot. */
export const adminPendingRegistrationGroupMovesAtom = atomFamily((_eventId: string) =>
  atom<RegistrationGroupMove[]>([])
)

export const createAdminNewRegistration = (): Registration => createRegistrationDraft('admin')
export const adminNewRegistrationAtom = atomWithLocalStorage<Registration | undefined>(
  'adminNewRegistration',
  createAdminNewRegistration()
)
