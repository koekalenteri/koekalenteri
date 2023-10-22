import type { AtomEffect } from 'recoil'
import type { Event } from '../../../../types'

import { getEvents } from '../../../../api/event'

let loaded = false

export const remoteAdminEventsEffect: AtomEffect<Event[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    loaded = true
    getEvents()
      .then(setSelf)
      .catch((reason) => {
        console.error(reason)
        setSelf([])
      })
  }
}
