import type { Language, RegistrationTime } from '../../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { eventTypeFilterAtom, eventTypeGroupsAtom, eventTypesAtom } from './atoms'

export const activeEventTypesSelector = selector({
  key: 'activeEventTypes',
  get: ({ get }) => get(eventTypesAtom).filter((et) => et.active),
})

export const filteredEventTypesSelector = selector({
  key: 'filteredEventTypes',
  get: ({ get }) => {
    const filter = get(eventTypeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(eventTypesAtom)

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

export const eventTypeGroupsSelector = selectorFamily<RegistrationTime[], string | undefined>({
  key: 'eventTypeGroupsSelector',
  get:
    (eventClass) =>
    ({ get }) =>
      eventClass ? get(eventTypeGroupsAtom)[eventClass] ?? [] : [],
})
