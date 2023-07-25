import type { Language } from 'koekalenteri-shared/model'

import i18next from 'i18next'
import { selector } from 'recoil'

import { eventTypeFilterAtom, eventTypesAtom } from './atoms'

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
