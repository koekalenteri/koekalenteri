import type { Registration } from '../../../types'
import { DefaultValue, selectorFamily } from 'recoil'
import { registrationByIdsAtom } from './atoms'

export const registrationSelector = selectorFamily<Registration | undefined | null, string | undefined>({
  get:
    (id) =>
    ({ get }) =>
      id ? get(registrationByIdsAtom(id)) : undefined,
  key: 'registrationSelector',
  set:
    (id) =>
    ({ set }, value) => {
      if (id && value && !(value instanceof DefaultValue)) {
        set(registrationByIdsAtom(id), value)
      }
    },
})
