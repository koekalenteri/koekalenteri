
import i18next from 'i18next'
import { EventType, Language } from 'koekalenteri-shared/model'
import { atom, selector, useRecoilState } from 'recoil'

import { getEventTypes, putEventType } from '../../api/eventType'

import { logEffect, storageEffect } from './effects'

export const eventTypesAtom = atom<EventType[]>({
  key: 'eventTypes',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    ({setSelf, trigger}) => {
      if (trigger === 'get') {
        getEventTypes()
          .then(eventTypes => {
            const sortedEventTypes = [...eventTypes].sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
            setSelf(sortedEventTypes)
          })
      }
    },
  ],
})

export const activeEventTypesQuery = selector({
  key: 'activeEventTypes',
  get: ({ get }) => get(eventTypesAtom).filter(et => et.active),
})

export const eventTypeClassesAtom = atom<Record<string, string[]>>({
  key: 'eventTypeClasses',
  default: {
    NOU: [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-A': [],
    'NOWT': ['ALO', 'AVO', 'VOI'],
  },
})

export const eventTypeFilterAtom = atom<string>({
  key: 'eventTypeFilter',
  default: '',
})

export const filteredEventTypesQuery = selector({
  key: 'filteredEventTypes',
  get: ({ get }) => {
    const filter = get(eventTypeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(eventTypesAtom)

    if (!filter) {
      return list
    }
    return list.filter(eventType =>
      [eventType.eventType, eventType.description[i18next.language as Language]]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter))
  },
})

export const useEventTypeActions = () => {
  const [eventTypes, setEventTypes] = useRecoilState(eventTypesAtom)

  return {
    refresh,
    save,
  }

  function refresh() {
    getEventTypes(true)
      .then(eventTypes => {
        const sortedEventTypes = [...eventTypes].sort((a, b) => a.eventType.localeCompare(b.eventType, i18next.language))
        setEventTypes(sortedEventTypes)
      })
  }

  async function save(eventType: EventType) {
    const index = eventTypes.findIndex(j => j.eventType === eventType.eventType)
    if (index === -1) {
      throw new Error(`EventType ${eventType.eventType} not found!`)
    }
    const saved = await putEventType(eventType)
    const newEventTypes = eventTypes.map<EventType>(j => ({ ...j }))
    newEventTypes.splice(index, 1, saved)
    setEventTypes(newEventTypes)
  }
}
