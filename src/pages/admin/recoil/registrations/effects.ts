import type { AtomEffect } from 'recoil'
import type { Registration } from '../../../../types'

import { DefaultValue } from 'recoil'

import { getRegistrations } from '../../../../api/registration'
import { accessTokenAtom } from '../../../recoil'

export const adminRemoteRegistrationsEffect =
  (eventId: string): AtomEffect<Registration[]> =>
  ({ getPromise, setSelf, trigger }) => {
    if (trigger === 'get') {
      setSelf(
        getPromise(accessTokenAtom).then((token) => {
          if (!token) return new DefaultValue()

          return getRegistrations(eventId, token).then((registrations) => registrations ?? new DefaultValue())
        })
      )
    }
  }
