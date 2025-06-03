import type { DogEvent, RegistrationClass } from '../../../../types'

import { atom, atomFamily, selector } from 'recoil'

import { uniqueClasses } from '../../../../lib/utils'
import { logEffect, sessionStorageEffect } from '../../../recoil'

import { adminCurrentEventSelector, adminEventSelector } from './selectors'

export const adminEventClassAtom = atom<RegistrationClass | string>({
  key: 'adminEventClass',
  default: selector({
    key: 'adminEventClass/default',
    get: ({ get }) => {
      const event = get(adminCurrentEventSelector)
      return uniqueClasses(event)[0]
    },
  }),
  effects: [logEffect, sessionStorageEffect],
})

/**
 * Existing event editing, edits stored to session storage
 */
export const adminEditableEventByIdAtom = atomFamily<DogEvent | undefined, string>({
  key: 'adminEditableEvent/Id',
  default: adminEventSelector,
  effects: [logEffect, sessionStorageEffect],
})
