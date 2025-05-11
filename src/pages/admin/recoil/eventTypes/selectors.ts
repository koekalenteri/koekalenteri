import type { Language, RegistrationTime } from '../../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { OFFICIAL_EVENT_TYPES } from '../../../../lib/event'

import { adminEventTypeFilterAtom, adminEventTypeGroupsAtom, adminEventTypesAtom } from './atoms'

export const adminActiveEventTypesSelector = selector({
  key: 'adminActiveEventTypes',
  get: ({ get }) => get(adminEventTypesAtom).filter((et) => et.active),
})

export const adminFilteredEventTypesSelector = selector({
  key: 'adminFilteredEventTypes',
  get: ({ get }) => {
    const filter = get(adminEventTypeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminEventTypesAtom)

    if (!filter) {
      return list
    }
    return list.filter((eventType) =>
      [eventType.eventType, eventType.description[i18next.language as Language]]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
  },
})

export const adminEventTypeGroupsSelector = selectorFamily<RegistrationTime[], string | undefined>({
  key: 'adminEventTypeGroupsSelector',
  get:
    (eventType) =>
    ({ get }) => {
      if (!eventType) return []
      const groups = get(adminEventTypeGroupsAtom)

      return OFFICIAL_EVENT_TYPES.includes(eventType) ? (groups[eventType] ?? []) : groups.unofficialEvents
    },
})
