import { Registration } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getRegistrations } from '../../../../api/registration'
import { getParamFromFamilyKey } from '../../../recoil'

const loaded: Record<string, boolean> = {}

export const remoteRegistrationsEffect: AtomEffect<Registration[]> = ({ node, setSelf, trigger }) => {
  const load = async () => {
    const eventId = getParamFromFamilyKey(node.key)
    if (loaded[eventId]) {
      return
    }
    loaded[eventId] = true
    const registrations = await getRegistrations(eventId)
    if (registrations) {
      setSelf(registrations)
    }
  }

  if (trigger === 'get') {
    load()
  }
}
