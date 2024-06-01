import type { Registration } from '../../../../types'

import { selector, selectorFamily } from 'recoil'

import { adminEventIdAtom } from '../events/atoms'

import { adminEventRegistrationsAtom, adminRegistrationIdAtom } from './atoms'

export const adminCurrentEventRegistrationsSelector = selector<Registration[]>({
  key: 'adminCurrentEventRegistrations',
  get: ({ get }) => {
    const currentEventId = get(adminEventIdAtom)
    return currentEventId ? get(adminEventRegistrationsAtom(currentEventId)) : []
  },
  set: ({ get, set }, newValue) => {
    const currentEventId = get(adminEventIdAtom)
    if (currentEventId) {
      set(adminEventRegistrationsAtom(currentEventId), newValue)
    }
  },
})

export const adminCurrentRegistrationSelector = selector<Registration | undefined>({
  key: 'adminCurrentRegistration',
  get: ({ get }) => {
    const registrationId = get(adminRegistrationIdAtom)
    return get(adminCurrentEventRegistrationsSelector).find((r) => r.id === registrationId)
  },
})

export const adminEventRegistrationSelector = selectorFamily<Registration | undefined, { eventId: string; id: string }>(
  {
    key: 'adminEventRegistrationsSelector/eventId',
    get:
      ({ eventId, id }) =>
      ({ get }) => {
        const registrations = get(adminEventRegistrationsAtom(eventId)) ?? []
        return registrations.find((r) => r.id === id)
      },
  }
)
