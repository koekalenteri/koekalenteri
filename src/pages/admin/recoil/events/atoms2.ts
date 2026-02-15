import type { DogEvent, RegistrationClass } from '../../../../types'
import { atom, atomFamily, selector } from 'recoil'
import { uniqueClasses } from '../../../../lib/utils'
import { logEffect, sessionStorageEffect } from '../../../recoil'
import { adminCurrentEventSelector, adminEventSelector } from './selectors'

export const adminEventClassAtom = atom<RegistrationClass>({
  default: selector({
    get: ({ get }) => {
      const event = get(adminCurrentEventSelector)
      return uniqueClasses(event)[0]
    },
    key: 'adminEventClass/default',
  }),
  effects: [logEffect, sessionStorageEffect],
  key: 'adminEventClass',
})

/**
 * Existing event editing, edits stored to session storage
 */
export const adminEditableEventByIdAtom = atomFamily<DogEvent, string>({
  default: adminEventSelector,
  effects: [logEffect, sessionStorageEffect],
  key: 'adminEditableEvent/Id',
})
