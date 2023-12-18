import type { AtomEffect } from 'recoil'
import type { EventType } from '../../../../types'

import i18next from 'i18next'

import { getEventTypes } from '../../../../api/eventType'
import { idTokenAtom } from '../../../recoil/user'

let loaded = false

export const remoteEventTypesEffect: AtomEffect<EventType[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      if (!token) return
      loaded = true
      getEventTypes(token)
        .then((eventTypes) => {
          eventTypes.sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
          setSelf(eventTypes)
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
