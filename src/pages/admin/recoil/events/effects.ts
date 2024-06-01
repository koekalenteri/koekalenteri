import type { AtomEffect } from 'recoil'
import type { DogEvent } from '../../../../types'

import { getAdminEvents } from '../../../../api/event'
import { idTokenAtom } from '../../../recoil'

let loaded = false

export const adminRemoteEventsEffect: AtomEffect<DogEvent[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      loaded = true
      getAdminEvents(token)
        .then(setSelf)
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
