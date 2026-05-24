import type { AtomEffect } from 'recoil'
import type { EventType } from '../../../../types'
import i18next from 'i18next'
import { getEventTypes } from '../../../../api/eventType'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

export const adminRemoteEventTypesEffect: AtomEffect<EventType[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'eventTypes',
  fetch: (token) => getEventTypes(token),
  sort: (eventTypes) => eventTypes.sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language)),
})
