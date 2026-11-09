import type { DogEvent, Registration } from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { allMaybe, mapMaybe } from '@/lib/maybePromise'
import { hasPaymentLockingRegistrations } from '@/lib/payment'
import { deriveParticipantGroupKey } from '@/lib/registration'
import { applyRegistrationGroupMoves } from '@/lib/registrationGroups'
import { isOfficialFormatLocked } from '@/lib/results'
import { adminEventAtom } from '../events/derivedAtoms'
import { adminEventRegistrationsAtom, adminPendingRegistrationGroupMovesAtom } from './atoms'

/**
 * Where a registration is placed, as one comparable string. The key is compared by the group it names,
 * not by its spelling: the projection respells a stored UTC-day key (KOE-1541), and a row that only
 * differs in that must not look moved. The group's day is the key it holds (KOE-1547).
 */
export const placementKey = (registration: Registration) =>
  JSON.stringify({
    cancelled: registration.cancelled,
    cancelReason: registration.cancelReason,
    group: registration.group
      ? { ...registration.group, key: deriveParticipantGroupKey(registration.group) }
      : undefined,
  })

export const adminEventRegistrationAtom = atomFamily(
  ({ eventId, id }: { eventId: string; id: string }) =>
    atom((get) =>
      mapMaybe(get(adminEventRegistrationsAtom(eventId)), (registrations) =>
        registrations.find((registration) => registration.id === id)
      )
    ),
  (left, right) => left.eventId === right.eventId && left.id === right.id
)

/**
 * Whether the event's payment terms are locked by its registrations (KOE-1568), by the rule PutEvent
 * refuses a change with. An event not yet saved has none, and nothing is fetched for it.
 */
export const adminEventPaymentLockedAtom = atomFamily((eventId: string) =>
  atom((get) => {
    if (!eventId) return false
    return mapMaybe(get(adminEventRegistrationsAtom(eventId)), hasPaymentLockingRegistrations)
  })
)

/**
 * Whether the official type an unofficial trial follows is locked (KOE-1718): a post has run a turn or a
 * dog has a result, by the rule PutEvent refuses a change with (`isOfficialFormatLocked`). An event not
 * yet saved has neither, and nothing is fetched for it.
 */
export const adminEventOfficialFormatLockedAtom = atomFamily((eventId: string) =>
  atom((get) => {
    if (!eventId) return false
    return mapMaybe(
      allMaybe([get(adminEventAtom(eventId)), get(adminEventRegistrationsAtom(eventId))]),
      ([event, registrations]) => isOfficialFormatLocked(event, registrations)
    )
  })
)

export const adminProjectedEventRegistrationsAtom = atomFamily((eventId: string) =>
  atom(
    (get) => {
      const moves = get(adminPendingRegistrationGroupMovesAtom(eventId))
      // The reserve numbering is the event's format's: a WT trial numbers its reserves across the classes.
      return mapMaybe(
        allMaybe([get(adminEventAtom(eventId)), get(adminEventRegistrationsAtom(eventId))]),
        ([event, registrations]) => applyRegistrationGroupMoves(registrations, moves, event).items
      )
    },
    (get, set, newValue: Registration[]) => {
      const updateBase = ([event, base]: [DogEvent, Registration[]]) => {
        const pendingMoves = get(adminPendingRegistrationGroupMovesAtom(eventId))
        if (pendingMoves.length === 0) {
          set(adminEventRegistrationsAtom(eventId), newValue)
          return
        }
        const projected = applyRegistrationGroupMoves(base, pendingMoves, event).items
        const baseById = new Map(base.map((registration) => [registration.id, registration]))
        const projectedById = new Map(projected.map((registration) => [registration.id, registration]))
        const serverSnapshot = newValue.map((registration) => {
          const stored = baseById.get(registration.id)
          const optimistic = projectedById.get(registration.id)
          if (
            !stored ||
            !optimistic ||
            placementKey(stored) === placementKey(optimistic) ||
            placementKey(registration) !== placementKey(optimistic)
          ) {
            return registration
          }
          return {
            ...registration,
            cancelled: stored.cancelled,
            cancelReason: stored.cancelReason,
            group: stored.group ? { ...stored.group } : undefined,
          }
        })
        set(adminEventRegistrationsAtom(eventId), serverSnapshot)
      }
      return mapMaybe(allMaybe([get(adminEventAtom(eventId)), get(adminEventRegistrationsAtom(eventId))]), updateBase)
    }
  )
)
