import type { EventType, JsonEventType } from '@/types'
import { getEventTypes } from '@/api/eventType'
import { compareByLocalizedString } from '@/lib/client/sort'
import { toEventType } from '@/lib/wire'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminEventTypesRemoteAtom = atomWithCachedRemoteCollection<EventType, JsonEventType>({
  cacheKey: 'eventTypes',
  fetch: (token) => getEventTypes(token),
  revive: toEventType,
  sort: (eventTypes) => {
    eventTypes.sort(compareByLocalizedString('eventType'))
    return eventTypes
  },
})
