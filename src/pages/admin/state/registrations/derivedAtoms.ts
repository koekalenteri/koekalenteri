import type { Registration } from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { mapMaybe } from '@/lib/maybePromise'
import { hasPaymentLockingRegistrations } from '@/lib/payment'
import { deriveParticipantGroupKey } from '@/lib/registration'
import { applyRegistrationGroupMoves } from '@/lib/registrationGroups'
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

export const adminProjectedEventRegistrationsAtom = atomFamily((eventId: string) =>
  atom(
    (get) => {
      const moves = get(adminPendingRegistrationGroupMovesAtom(eventId))
      return mapMaybe(
        get(adminEventRegistrationsAtom(eventId)),
        (registrations) => applyRegistrationGroupMoves(registrations, moves).items
      )
    },
    (get, set, newValue: Registration[]) => {
      const updateBase = (base: Registration[]) => {
        const pendingMoves = get(adminPendingRegistrationGroupMovesAtom(eventId))
        if (pendingMoves.length === 0) {
          set(adminEventRegistrationsAtom(eventId), newValue)
          return
        }
        const projected = applyRegistrationGroupMoves(base, pendingMoves).items
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
      return mapMaybe(get(adminEventRegistrationsAtom(eventId)), updateBase)
    }
  )
)
