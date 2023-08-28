import type { Registration } from 'koekalenteri-shared/model'

import { selector, selectorFamily } from 'recoil'

import { adminEventIdAtom } from '../events/atoms'

import { adminRegistrationIdAtom, eventRegistrationsAtom } from './atoms'

export const currentEventRegistrationsSelector = selector<Registration[]>({
  key: 'currentEventRegistrations',
  get: ({ get }) => {
    const currentEventId = get(adminEventIdAtom)
    return currentEventId ? get(eventRegistrationsAtom(currentEventId)) : []
  },
  set: ({ get, set }, newValue) => {
    const currentEventId = get(adminEventIdAtom)
    if (currentEventId) {
      set(eventRegistrationsAtom(currentEventId), newValue)
    }
  },
})

export const currentAdminRegistrationSelector = selector<Registration | undefined>({
  key: 'currentAdminRegistration',
  get: ({ get }) => {
    const registrationId = get(adminRegistrationIdAtom)
    return get(currentEventRegistrationsSelector).find((r) => r.id === registrationId)
  },
})

export const adminEventRegistrationSelector = selectorFamily<Registration | undefined, { eventId: string; id: string }>(
  {
    key: 'adminEventRegistrationsSelector/eventId',
    get:
      ({ eventId, id }) =>
      ({ get }) => {
        const registrations = get(eventRegistrationsAtom(eventId)) ?? []
        return registrations.find((r) => r.id === id)
      },
  }
)
