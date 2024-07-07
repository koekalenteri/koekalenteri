import type { AtomEffect } from 'recoil'
import type { DogEvent } from '../../../../types'

import { DefaultValue } from 'recoil'

import { getAdminEvents } from '../../../../api/event'
import { idTokenAtom } from '../../../recoil'

export const adminRemoteEventsEffect: AtomEffect<DogEvent[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(idTokenAtom).then((token) =>
        token
          ? getAdminEvents(token).then((events) => events.sort((a, b) => a.startDate.valueOf() - b.startDate.valueOf()))
          : new DefaultValue()
      )
    )
  }
}
