import type { AtomEffect } from 'recoil'
import type { Registration } from '../../../../types'

import { DefaultValue } from 'recoil'

import { getRegistrations } from '../../../../api/registration'
import { getParamFromFamilyKey, idTokenAtom } from '../../../recoil'

export const adminRemoteRegistrationsEffect: AtomEffect<Registration[]> = ({ getPromise, node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const eventId = getParamFromFamilyKey(node.key)

    setSelf(
      getPromise(idTokenAtom).then((token) => {
        if (!token) return new DefaultValue()

        return getRegistrations(eventId, token).then((registrations) => {
          return registrations ?? new DefaultValue()
        })
      })
    )
  }
}
