import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistration } from '../../../api/registration'
import { getParamFromFamilyKey } from '../effects'

export const remoteRegistrationEffect: AtomEffect<Registration | undefined> = ({
  getPromise,
  node,
  setSelf,
  trigger,
}) => {
  const load = async () => {
    const [eventId, registrationId] = getParamFromFamilyKey(node.key).split(':')
    const registration = await getRegistration(eventId, registrationId)
    if (registration) {
      setSelf(registration)
    }
  }

  if (trigger === 'get') {
    load()
  }
}
