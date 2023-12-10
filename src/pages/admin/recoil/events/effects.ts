import type { AtomEffect } from 'recoil'
import type { DogEvent } from '../../../../types'

import { getAdminEvents } from '../../../../api/event'

let loaded = false

export const remoteAdminEventsEffect: AtomEffect<DogEvent[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    loaded = true
    getAdminEvents()
      .then(setSelf)
      .catch((reason) => {
        console.error(reason)
        setSelf([])
      })
  }
}
