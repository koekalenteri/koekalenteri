import type { Registration } from 'koekalenteri-shared/model'
import type { AtomEffect } from 'recoil'

import { getRegistrations } from '../../../../api/registration'
import { getParamFromFamilyKey, idTokenAtom } from '../../../recoil'

const loaded: Record<string, boolean> = {}

export const remoteRegistrationsEffect: AtomEffect<Registration[]> = ({ getPromise, node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const eventId = getParamFromFamilyKey(node.key)
    if (loaded[eventId]) return
    loaded[eventId] = true
    getPromise(idTokenAtom).then((token) => {
      getRegistrations(eventId, token)
        .then((registrations) => {
          if (registrations) {
            setSelf(registrations)
          }
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
