import type { AtomEffect } from 'recoil'
import type { Registration } from '../../../types'

import { getRegistration } from '../../../api/registration'

export const remoteRegistrationEffect =
  (param: string): AtomEffect<Registration | undefined | null> =>
  ({ node, setSelf, trigger }) => {
    if (trigger === 'get') {
      const [eventId, registrationId] = param.split(':')
      setSelf(getRegistration(eventId, registrationId).then((registration) => registration ?? null))
    }
  }
