import { Registration } from 'koekalenteri-shared/model'
import { DefaultValue, selectorFamily } from 'recoil'

import { registrationByIdsAtom } from './atoms'


export const registrationSelector = selectorFamily<Registration | undefined, string | undefined>({
  key: 'registrationSelector',
  get: id => ({get}) => {
    if (!id) {
      return
    }
    return get(registrationByIdsAtom(id))
  },
  set: id => ({set}, value) => {
    if (!id || !value || value instanceof DefaultValue) {
      return
    }
    set(registrationByIdsAtom(id), value)
  },
})
