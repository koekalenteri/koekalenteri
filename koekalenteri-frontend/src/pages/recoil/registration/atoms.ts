import { Registration } from "koekalenteri-shared/model"
import { atom, atomFamily } from "recoil"

import { getRegistration } from "../../../api/registration"
import { emptyBreeder, emptyDog, emptyPerson } from "../../components/RegistrationForm"
import { logEffect, parseStorageJSON, storageEffect } from "../effects"
import { eventIdAtom } from "../events"


export const registrationIdAtom = atom<string | undefined>({
  key: 'registrationId',
  default: '',
  effects: [
    logEffect,
  ],
})

/**
 * new Registration, temporarily stored to local storage
 */
export const newRegistrationAtom = atom<Registration | undefined>({
  key: 'newRegistration',
  default: {
    id: '',
    createdAt: new Date(),
    createdBy: 'anonymous',
    modifiedAt: new Date(),
    modifiedBy: 'anonymous',
    agreeToPublish: false,
    agreeToTerms: false,
    breeder: {...emptyBreeder},
    dates: [],
    dog: {...emptyDog},
    eventId: '',
    eventType: '',
    handler: {...emptyPerson},
    language: 'fi',
    notes: '',
    owner: {...emptyPerson},
    qualifyingResults: [],
    reserve: '',
  },
  effects: [
    logEffect,
    storageEffect,
  ],
})


export const registrationStorageKey = (registrationId: string) => `editableRegistration/Id-${registrationId}`

/**
 * Existing registration editing, edits stored to local storage
 */
export const editableRegistrationByIdAtom = atomFamily<Registration | undefined, string>({
  key: 'editableRegistration/Id',
  default: undefined,
  effects: registrationId => [
    ({ setSelf, onSet, getPromise }) => {
      const key = registrationStorageKey(registrationId)

      const savedValue = localStorage.getItem(key)
      if (savedValue !== null) {
        const parsed = parseStorageJSON(savedValue)
        setSelf(parsed)
      } else {
        getPromise(eventIdAtom).then(eventId => {
          if (eventId) {
            getRegistration(eventId, registrationId).then(setSelf)
          }
        })
      }

      onSet(async (newValue, _, isReset) => {
        if (isReset || newValue === null || newValue === undefined) {
          localStorage.removeItem(key)
          setSelf(undefined)
        } else {
          localStorage.setItem(key, JSON.stringify(newValue))
        }
      })
    },
  ],
})


