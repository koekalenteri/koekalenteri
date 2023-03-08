import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistration } from '../../../api/registration'
import { getParamFromFamilyKey } from '../effects'

export const remoteRegistrationEffect: AtomEffect<Registration | undefined | null> = ({ node, setSelf, trigger }) => {
  const load = async () => {
    const [eventId, registrationId] = getParamFromFamilyKey(node.key).split(':')
    const registration = await getRegistration(eventId, registrationId)
    setSelf(registration ? registration : null)
  }

  if (trigger === 'get') {
    load()
  }
}
