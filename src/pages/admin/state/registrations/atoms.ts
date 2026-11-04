import type { DuplicatePaymentEntry, JsonRegistration, Registration, RegistrationGroupMove } from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { getDuplicatePayments, getRegistrations } from '@/api/registration'
import { reportError } from '@/lib/client/error'
import { keepNewerRows } from '@/lib/incremental'
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
    (get, set, value: Registration[] | ((previous: Registration[]) => Registration[])) => {
      if (typeof value !== 'function') {
        set(overrideAtom, value)
        return
      }
      // A list nothing has written to yet is still the loaded one: an update builds on that.
      const current = get(overrideAtom) ?? asSettled(get(loadedListAtom))
      if (current instanceof Promise) throw new Error('Cannot update registrations before they have loaded')
      set(overrideAtom, value(current))
    }
  )
})

/**
 * Reads the event's whole list and writes it, for the view that needs what the server holds now: a
 * refused save, and a socket that was away. Without a token nothing is read or written (an empty
 * answer would read as a trial with no dogs), and the answer is undefined.
 *
 * The answer belongs to the token that read it, and is dropped if that has changed. The instance is
 * taken before the read, so an answer arriving after the event's atoms were released goes to the
 * dropped instance: looking it up again would create one, holding this user's rows for the next login.
 */
export const adminEventRegistrationsReloadAtom = atom(
  null,
  async (get, set, eventId: string): Promise<Registration[] | undefined> => {
    const token = get(validIdTokenAtom)
    if (!token) return undefined
    const listAtom = adminEventRegistrationsAtom(eventId)
    const answer = await getRegistrations(eventId, token)
    if (get(validIdTokenAtom) !== token) return undefined

    const held = get(listAtom)
    const registrations = held instanceof Promise ? answer : keepNewerRows(held, answer)
    set(listAtom, registrations)
    return registrations
  }
)

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
