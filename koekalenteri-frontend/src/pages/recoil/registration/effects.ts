import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistration } from '../../../api/registration'
import { getParamFromFamilyKey } from '../effects'

export const remoteRegistrationEffect: AtomEffect<Registration | undefined | null> = ({ node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const [eventId, registrationId] = getParamFromFamilyKey(node.key).split(':')
    getRegistration(eventId, registrationId)
      .then((registration) => setSelf(registration ?? null))
      .catch((reason) => {
        throw new Error(reason)
      })
  }
}
