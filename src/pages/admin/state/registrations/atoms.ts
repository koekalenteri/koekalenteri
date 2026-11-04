import type { DuplicatePaymentEntry, JsonRegistration, Registration, RegistrationGroupMove } from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { getDuplicatePayments, getRegistrations } from '@/api/registration'
import { reportError } from '@/lib/client/error'
import { asSettled } from '@/lib/maybePromise'
import { createRegistrationDraft } from '@/lib/registration'
import { toStoredRegistration } from '@/lib/wire'
import { atomWithLocalStorage } from '@/pages/state'
import { loadedAtom } from '@/pages/state/loadedAtom'
import { validIdTokenAtom } from '@/pages/state/user'

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
  // A refetch after a refreshed id token never suspends the results page (loadedAtom).
  const loadedListAtom = loadedAtom(remoteAtom)
  return atom(
    (get) => asSettled(get(overrideAtom) ?? get(loadedListAtom)),
    (_get, set, value: Registration[] | ((previous: Registration[]) => Registration[])) =>
      set(overrideAtom, (current) => {
        if (typeof value !== 'function') return value
        if (!current) throw new Error('Cannot update registrations before they have loaded')
        return value(current)
      })
  )
})

/** Bumped to fetch the event's payments charged twice again. */
export const adminDuplicatePaymentsRefreshAtom = atomFamily((_eventId: string) => atom(0))

/**
 * The event's payments charged twice that have not gone back. A list of its own: such a row must stay
 * off everything that reads the registrations (KOE-1693). A failed fetch keeps the last list, as the
 * section beside the class lists must never take the page down with it.
 */
export const adminDuplicatePaymentsAtom = atomFamily((eventId: string) => {
  let latest: DuplicatePaymentEntry[] = []
  return loadedAtom(
    atom(async (get) => {
      get(adminDuplicatePaymentsRefreshAtom(eventId))
      const token = get(validIdTokenAtom)
      if (!token) return latest
      try {
        latest = await getDuplicatePayments(eventId, token)
      } catch (error) {
        reportError(error)
      }
      return latest
    })
  )
})

/** Local-only commands layered over the WebSocket-backed server snapshot. */
export const adminPendingRegistrationGroupMovesAtom = atomFamily((_eventId: string) =>
  atom<RegistrationGroupMove[]>([])
)

export const createAdminNewRegistration = (): Registration => createRegistrationDraft('admin')
export const adminNewRegistrationAtom = atomWithLocalStorage<Registration | undefined, JsonRegistration>(
  'adminNewRegistration',
  createAdminNewRegistration(),
  { revive: toStoredRegistration }
)
