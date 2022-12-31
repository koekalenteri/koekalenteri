import { EventEx } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getEvents } from '../../../api/event'

export const remoteEventsEffect: AtomEffect<EventEx[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getEvents().then(setSelf)
  }
}
