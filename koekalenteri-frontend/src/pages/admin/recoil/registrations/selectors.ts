import { Registration, RegistrationGroup } from "koekalenteri-shared/model"
import { selector } from "recoil"

import { adminEventIdAtom, eventClassAtom } from "../events/atoms"

import { eventRegistrationsAtom } from "./atoms"

export interface RegistrationWithMutators extends Registration {
  setGroup: (group?: RegistrationGroup) => void
}

export const currentEventClassRegistrationsQuery = selector<RegistrationWithMutators[]>({
  key: 'CurrentEventClassRegistrations',
  get: ({ get, getCallback }) => {
    const eventClass = get(eventClassAtom)
    const registrations = get(currentEventRegistrationsQuery)
    return registrations.filter(r => r.class === eventClass).map(r => ({
      ...r,
      setGroup: getCallback(({ set }) => async (group?: RegistrationGroup) => {
        const newList = [...registrations]
        const index = newList.findIndex(item => item.id === r.id)
        if (index !== -1) {
          newList.splice(index, 1, { ...r, group })
        }
        set(currentEventRegistrationsQuery, newList)
      }),
    }))
  },
})

export const currentEventRegistrationsQuery = selector<Registration[]>({
  key: 'CurrentEventRegistrationsQuery',
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
