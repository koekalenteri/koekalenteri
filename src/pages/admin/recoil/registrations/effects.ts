import type { AtomEffect } from 'recoil'
import type { Registration } from '../../../../types'

import { getRegistrations } from '../../../../api/registration'
import { getParamFromFamilyKey, idTokenAtom } from '../../../recoil'

const loaded: Record<string, boolean> = {}

export const remoteRegistrationsEffect: AtomEffect<Registration[]> = ({ getPromise, node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const eventId = getParamFromFamilyKey(node.key)
    if (loaded[eventId]) return
    getPromise(idTokenAtom).then((token) => {
      if (!token) return
      loaded[eventId] = true
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
