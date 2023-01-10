import { Registration } from "koekalenteri-shared/model"
import { DefaultValue, selectorFamily } from "recoil"

import { editableRegistrationByIdAtom, newRegistrationAtom, registrationStorageKey } from "./atoms"


/**
 * Abstration for new / existing registration
 */
export const editableRegistrationSelector = selectorFamily<Registration | undefined, string|undefined>({
  key: 'editableRegistration',
  get: (registrationId) => ({ get }) => registrationId ? get(editableRegistrationByIdAtom(registrationId)) : get(newRegistrationAtom),
  set: (registrationId) => ({ set, reset }, newValue) => {
    if (registrationId) {
      set(editableRegistrationByIdAtom(registrationId), newValue)
    } else if (newValue) {
      set(newRegistrationAtom, newValue)
    } else {
      reset(newRegistrationAtom)
    }
  },
})

/**
 * Abstraction for new / existing registration modified status
 */
export const editableRegistrationModifiedSelector = selectorFamily<boolean, string|undefined>({
  key: 'editableRegistration/modified',
  get: (registrationId) => ({ get }) => {
    if (registrationId) {
      const stored = localStorage.getItem(registrationStorageKey(registrationId))
      return stored !== null
    } else {
      const value = get(newRegistrationAtom)
      return !(value instanceof DefaultValue)
    }
  },
})
