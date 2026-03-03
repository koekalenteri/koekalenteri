import type { Registration } from '../../../../types'
import { selectorFamily } from 'recoil'
import { adminEventRegistrationsAtom } from './atoms'

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
      get(adminEventRegistrationsAtom(eventId)) ?? [],
  key: 'adminEventRegistrationsSelector/eventId',
  set:
    (eventId) =>
    ({ set }, newValue) =>
      set(adminEventRegistrationsAtom(eventId), newValue),
})
