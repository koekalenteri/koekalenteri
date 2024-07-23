import type { AtomEffect } from 'recoil'
import type { DogEvent } from '../../../../types'

import { DefaultValue } from 'recoil'

import { getAdminEvents } from '../../../../api/event'
import { idTokenAtom } from '../../../recoil'

const byStartDate = (a: DogEvent, b: DogEvent) => a.startDate.valueOf() - b.startDate.valueOf()
const sortEvents = (events: DogEvent[]): DogEvent[] => [...events].sort(byStartDate)

export const adminRemoteEventsEffect: AtomEffect<DogEvent[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(idTokenAtom).then((token) =>
        token ? getAdminEvents(token).then((events) => sortEvents(events)) : new DefaultValue()
      )
      /*
      Promise.all([getPromise(idTokenAtom), getPromise(adminEventsFetchedAtom)]).then(([token, lastModified]) =>
        token ? getAdminEvents(token, lastModified).then((events) => sortEvents(events)) : new DefaultValue()
      )
      */
    )
  }
}
