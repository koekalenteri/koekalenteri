import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistration } from '../../../api/registration'
import { getParamFromFamilyKey } from '../effects'
import { eventIdAtom } from '../events'

let loaded: string|undefined

export const remoteRegistrationEffect: AtomEffect<Registration | undefined> = ({ getPromise, node, setSelf, trigger }) => {
  const load = async () => {
    const eventId = await getPromise(eventIdAtom)
    if (!eventId || loaded === eventId) {
      return
    }
    loaded = eventId
    const registrationId = getParamFromFamilyKey(node.key)
    const registration = await getRegistration(eventId, registrationId)
    if (registration) {
      setSelf(registration)
    }
  }

  if (trigger === 'get') {
    load()
  }
}
