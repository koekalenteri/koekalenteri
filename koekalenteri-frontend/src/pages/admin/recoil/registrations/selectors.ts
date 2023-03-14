import { Registration } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { adminEventIdAtom, eventClassAtom } from '../events/atoms'

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

export const currentEventClassRegistrationsSelector = selector<Registration[]>({
  key: 'currentEventClassRegistrations',
  get: ({ get }) => {
    const eventClass = get(eventClassAtom)
    const registrations = get(currentEventRegistrationsSelector)
    return registrations.filter((r) => r.class === eventClass || r.eventType === eventClass)
  },
})

export const currentAdminRegistrationSelector = selector<Registration | undefined>({
  key: 'currentAdminRegistration',
  get: ({ get }) => {
    const registrationId = get(adminRegistrationIdAtom)
    return get(currentEventRegistrationsSelector).find((r) => r.id === registrationId)
  },
})

export const currentAdminEventRegistrationSelector = selectorFamily<Registration | undefined, string | undefined>({
  key: 'currentAdminEventRegistrationSelector',
  get:
    (registrationId) =>
    ({ get }) => {
      if (!registrationId) {
        return
      }
      const registrations = get(currentEventRegistrationsSelector)
      return registrations.find((r) => r.id === registrationId)
    },
})
