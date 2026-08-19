import type { EventType } from '../../../../types'
import { getEventTypes } from '../../../../api/eventType'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminEventTypesRemoteAtom = atomWithCachedRemoteCollection<EventType>({
  cacheKey: 'eventTypes',
  fetch: (token) => getEventTypes(token),
  sort: (eventTypes) => {
    eventTypes.sort(compareByLocalizedString('eventType'))
    return eventTypes
  },
})
