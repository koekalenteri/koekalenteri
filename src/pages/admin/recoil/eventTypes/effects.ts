import type { AtomEffect } from 'recoil'
import type { EventType } from '../../../../types'
import { getEventTypes } from '../../../../api/eventType'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

export const adminRemoteEventTypesEffect: AtomEffect<EventType[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'eventTypes',
  fetch: (token) => getEventTypes(token),
  sort: (eventTypes) => {
    eventTypes.sort(compareByLocalizedString('eventType'))
    return eventTypes
  },
})
