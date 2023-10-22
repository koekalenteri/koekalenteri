import type { Registration } from '../../../types'

import { DefaultValue, selectorFamily } from 'recoil'

import { registrationByIdsAtom } from './atoms'

export const registrationSelector = selectorFamily<Registration | undefined | null, string | undefined>({
  key: 'registrationSelector',
  get:
    (id) =>
    ({ get }) => {
      if (!id) {
        return
      }
      return get(registrationByIdsAtom(id))
    },
  set:
    (id) =>
    ({ set }, value) => {
      if (!id || !value || value instanceof DefaultValue) {
        return
      }
      set(registrationByIdsAtom(id), value)
    },
})
