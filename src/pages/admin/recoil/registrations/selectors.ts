import type { Registration } from '../../../../types'
import { selectorFamily } from 'recoil'
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

export const adminEventRegistrationSelector = selectorFamily<Registration | undefined, { eventId: string; id: string }>(
  {
    get:
      ({ eventId, id }) =>
      ({ get }) => {
        const registrations = get(adminEventRegistrationsAtom(eventId)) ?? []
        return registrations.find((r) => r.id === id)
      },
    key: 'adminEventRegistrationSelector/eventId',
  }
)

export const adminEventRegistrationsSelector = selectorFamily<Registration[], string>({
  get:
    (eventId) =>
    ({ get }) =>
      applyRegistrationGroupMoves(
        get(adminEventRegistrationsAtom(eventId)) ?? [],
        get(adminPendingRegistrationGroupMovesAtom(eventId))
      ).items,
  key: 'adminEventRegistrationsSelector/eventId',
  set:
    (eventId) =>
    ({ get, set }, newValue) => {
      if (!Array.isArray(newValue)) {
        set(adminEventRegistrationsAtom(eventId), newValue)
        return
      }

      const base = get(adminEventRegistrationsAtom(eventId)) ?? []
      const pendingMoves = get(adminPendingRegistrationGroupMovesAtom(eventId))
      if (pendingMoves.length === 0) {
        set(adminEventRegistrationsAtom(eventId), newValue)
        return
      }

      const projected = applyRegistrationGroupMoves(base, pendingMoves).items
      const baseById = new Map(base.map((registration) => [registration.id, registration]))
      const projectedById = new Map(projected.map((registration) => [registration.id, registration]))

      // The selector exposes the optimistic projection, but callers also use
      // its setter for unrelated edits (notes, refunds, etc.). Restore only
      // placement values inherited from that projection before updating the
      // server snapshot; pending moves remain a separate overlay.
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
    },
})
