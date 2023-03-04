import { Event } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getEvents } from '../../../../api/event'

export const remoteAdminEventsEffect: AtomEffect<Event[]> = ({ setSelf }) => {
  // console.log('loading remote events...')
  getEvents().then(setSelf)
}
