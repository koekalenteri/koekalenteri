import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistrations } from '../../../../api/registration'
import { getParamFromFamilyKey } from '../../../recoil'

const loaded: Record<string, boolean> = {}

export const remoteRegistrationsEffect: AtomEffect<Registration[]> = ({ node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const eventId = getParamFromFamilyKey(node.key)
    if (loaded[eventId]) return
    loaded[eventId] = true
    getRegistrations(eventId)
      .then((registrations) => {
        if (registrations) {
          setSelf(registrations)
        }
      })
      .catch((reason) => {
        throw new Error(reason)
      })
  }
}
