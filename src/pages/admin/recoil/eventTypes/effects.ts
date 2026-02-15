import type { AtomEffect } from 'recoil'
import type { EventType } from '../../../../types'

import i18next from 'i18next'
import { DefaultValue } from 'recoil'

import { getEventTypes } from '../../../../api/eventType'
import { accessTokenAtom } from '../../../recoil/user'

export const adminRemoteEventTypesEffect: AtomEffect<EventType[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(accessTokenAtom).then((token) =>
        token
          ? getEventTypes(token).then((eventTypes) => {
              eventTypes.sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))

              return eventTypes
            })
          : new DefaultValue()
      )
    )
  }
}
