import type { AtomEffect } from 'recoil'
import type { Registration } from '../../../types'
import { getRegistration } from '../../../api/registration'

export const remoteRegistrationEffect =
  (param: string): AtomEffect<Registration | undefined | null> =>
  ({ setSelf, trigger }) => {
    if (trigger === 'get') {
      const [eventId, registrationId, editToken] = param.split(':')
      setSelf(
        getRegistration(eventId, registrationId, editToken || undefined)
          .then((registration) => registration ?? null)
          .catch(() => null)
      )
    }
  }
