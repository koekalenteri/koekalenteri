import i18next from 'i18next'
import { EventType } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getEventTypes } from '../../../api/eventType'

let loaded = false

export const remoteEventTypesEffect: AtomEffect<EventType[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    loaded = true
    getEventTypes()
      .then((eventTypes) => {
        eventTypes.sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
        setSelf(eventTypes)
      })
      .catch((reason) => {
        throw new Error(reason)
      })
  }
}
