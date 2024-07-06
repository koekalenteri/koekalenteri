import type { Registration } from '../../../../types'

import { selectorFamily } from 'recoil'

import { adminEventRegistrationsAtom } from './atoms'

export const adminEventRegistrationSelector = selectorFamily<Registration | undefined, { eventId: string; id: string }>(
  {
    key: 'adminEventRegistrationSelector/eventId',
    get:
      ({ eventId, id }) =>
      ({ get }) => {
        const registrations = get(adminEventRegistrationsAtom(eventId)) ?? []
        return registrations.find((r) => r.id === id)
      },
  }
)

export const adminEventRegistrationsSelector = selectorFamily<Registration[], string>({
  key: 'adminEventRegistrationsSelector/eventId',
  get:
    (eventId) =>
    ({ get }) =>
      get(adminEventRegistrationsAtom(eventId)) ?? [],
  set:
    (eventId) =>
    ({ set }, newValue) =>
      set(adminEventRegistrationsAtom(eventId), newValue),
})
