import { Registration } from 'koekalenteri-shared/model'
import { DefaultValue, selectorFamily } from 'recoil'

import { registrationByIdAtom } from './atoms'


export const registrationSelector = selectorFamily<Registration | undefined, string | undefined>({
  key: 'adminEventSelector',
  get: id => ({get}) => {
    if (!id) {
      return
    }
    return get(registrationByIdAtom(id))
  },
  set: id => ({set}, value) => {
    if (!id || !value || value instanceof DefaultValue) {
      return
    }
    set(registrationByIdAtom(id), value)
  },
})
