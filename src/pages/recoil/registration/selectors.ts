import type { Registration } from '../../../types'

import { DefaultValue, selectorFamily } from 'recoil'

import { registrationByIdsAtom } from './atoms'

export const registrationSelector = selectorFamily<Registration | undefined | null, string | undefined>({
  key: 'registrationSelector',
  get:
    (id) =>
    ({ get }) =>
      id ? get(registrationByIdsAtom(id)) : undefined,
  set:
    (id) =>
    ({ set }, value) => {
      if (id && value && !(value instanceof DefaultValue)) {
        set(registrationByIdsAtom(id), value)
      }
    },
})
