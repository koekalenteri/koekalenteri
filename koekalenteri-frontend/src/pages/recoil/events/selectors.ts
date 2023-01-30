import i18next from 'i18next'
import { Event, EventClass, Organizer } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { unique, uniqueFn } from '../../../utils'
import { judgesAtom } from '../judges/atoms'

import { eventFilterAtom, eventIdAtom, eventsAtom } from './atoms'
import { withinArrayFilters, withinDateFilters, withinSwitchFilters } from './filters'


export const eventSelector = selectorFamily<Event | undefined, string|undefined>({
  key: 'event',
  get: (eventId) => ({ get }) => {
    if (!eventId) {
      return
    }
    // get from the eventsAtom
    return get(eventByIdSelector(eventId))
  },
})

export const eventByIdSelector = selectorFamily<Event | undefined, string>({
  key: 'event/Id',
  get: (eventId) => ({ get }) => get(eventsAtom).find(event => event.id === eventId),
})

export const currentEventSelector = selector({
  key: 'currentEvent',
  get: ({ get }) => get(eventSelector(get(eventIdAtom))),
})

export const filteredEventsSelector = selector({
  key: 'filteredEvents',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter(event => {
      return event.state !== 'draft' && !event.deletedAt
        && withinDateFilters(event, filter)
        && withinSwitchFilters(event, filter)
        && withinArrayFilters(event, filter)
    })
  },
})

export const filterJudgesSelector = selector({
  key: 'filterJudges',
  get: ({ get }) => {
    const events = get(filteredEventsSelector)
    const judges = get(judgesAtom)
    const usedJudgeIds = unique<number>(events.reduce<number[]>((acc, cur) => [...acc, ...cur.judges], []))

    return judges
      .filter(j => usedJudgeIds.includes(j.id))
      .sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
})

export const filterOrganizersSelector = selector({
  key: 'filterOrganizers',
  get: ({ get }) => {
    const events = get(filteredEventsSelector)
    const uniqueOrganizers = uniqueFn<Organizer>(events.map(e => e.organizer), (a, b) => a.id === b.id)
    uniqueOrganizers.sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    return uniqueOrganizers
  },
})

export const filterEventTypesSelector = selector({
  key: 'filterEventTypes',
  get: ({ get }) => {
    const events = get(filteredEventsSelector)
    const uniqueEventTypes = unique<string>(events.map(e => e.eventType))
    uniqueEventTypes.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventTypes
  },
})

export const filterEventClassesSelector = selector({
  key: 'filterEventClasses',
  get: ({ get }) => {
    const events = get(filteredEventsSelector)
    const uniqueEventClasses = unique<string>(events.reduce<EventClass[]>((acc, cur) => [...acc, ...cur.classes], []).map(ec => ec.class))
    uniqueEventClasses.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventClasses
  },
})
