import type { Registration } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { applyRegistrationGroupMoves } from '../../../../lib/registrationGroups'
import { adminEventRegistrationsAtom, adminPendingRegistrationGroupMovesAtom } from './atoms'

const placementKey = (registration: Registration) =>
  JSON.stringify({
    cancelled: registration.cancelled,
    cancelReason: registration.cancelReason,
    group: registration.group
      ? {
          ...registration.group,
          date:
            registration.group.date instanceof Date ? registration.group.date.toISOString() : registration.group.date,
        }
      : undefined,
  })

export const adminEventRegistrationAtom = atomFamily(
  ({ eventId, id }: { eventId: string; id: string }) =>
    atom((get) => {
      const registrations = get(adminEventRegistrationsAtom(eventId))
      return registrations instanceof Promise
        ? registrations.then((items) => items.find((registration) => registration.id === id))
        : registrations.find((registration) => registration.id === id)
    }),
  (left, right) => left.eventId === right.eventId && left.id === right.id
)

export const adminProjectedEventRegistrationsAtom = atomFamily((eventId: string) =>
  atom(
    (get) => {
      const registrations = get(adminEventRegistrationsAtom(eventId))
      const moves = get(adminPendingRegistrationGroupMovesAtom(eventId))
      return registrations instanceof Promise
        ? registrations.then((items) => applyRegistrationGroupMoves(items, moves).items)
        : applyRegistrationGroupMoves(registrations, moves).items
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
      const base = get(adminEventRegistrationsAtom(eventId))
      return base instanceof Promise ? base.then(updateBase) : updateBase(base)
    }
  )
)
