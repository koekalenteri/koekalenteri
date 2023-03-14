import { Registration, RegistrationGroup } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { adminEventIdAtom, eventClassAtom } from '../events/atoms'

import { adminRegistrationIdAtom, eventRegistrationsAtom } from './atoms'

export interface RegistrationWithMutators extends Registration {
  setGroup: (group: RegistrationGroup) => Promise<void>
}

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

export const currentEventClassRegistrationsSelector = selector<RegistrationWithMutators[]>({
  key: 'currentEventClassRegistrations',
  get: ({ get, getCallback }) => {
    const eventClass = get(eventClassAtom)
    const registrations = get(currentEventRegistrationsSelector)
    return registrations
      .filter((r) => r.class === eventClass || r.eventType === eventClass)
      .map((r) => ({
        ...r,
        setGroup: getCallback(({ set }) => async (group: RegistrationGroup) => {
          const newList = [...registrations]
          const index = newList.findIndex((item) => item.id === r.id)
          if (index !== -1) {
            newList.splice(index, 1, { ...r, group: { ...group } })
          }
          newList.sort((a, b) => {
            if (a.group?.key === b.group?.key) {
              return (a.group?.number || 999) - (b.group?.number || 999)
            }
            return (a.group?.key ?? '').localeCompare(b.group?.key ?? '')
          })
          console.log(`${r.id} => ${group?.key}:${group?.number}`)
          console.log(newList.map((r) => `${r.id} == ${r.group?.key}:${r.group?.number}`))
          set(currentEventRegistrationsSelector, newList)
        }),
      }))
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
