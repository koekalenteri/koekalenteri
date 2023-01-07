import i18next from 'i18next'
import { Event, Organizer } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { getEvent } from '../../../api/event'
import { unique, uniqueFn } from '../../../utils'
import { judgesAtom } from '../judges/atoms'

import { eventFilterAtom, eventIdAtom, eventsAtom } from './atoms'
import { withinArrayFilters, withinDateFilters, withinSwitchFilters } from "./filters"


export const eventByIdAtom = selectorFamily<Event | undefined, string>({
  key: 'adminEvents/eventId',
  get: (eventId) => ({ get }) => get(eventsAtom).find(event => event.id === eventId) ?? getEvent(eventId),
})

export const eventSelector = selectorFamily<Event | undefined, string>({
  key: 'event',
  get: (eventId) => ({ get }) => get(eventByIdAtom(eventId)),
})

export const currentEvent = selector({
  key: 'currentEvent',
  get: ({ get }) => {
    const eventId = get(eventIdAtom)
    return eventId ? get(eventSelector(eventId)) : undefined
  },
})

export const filterJudgesQuery = selector({
  key: 'filterJudges',
  get: ({ get }) => {
    const events = get(filteredEvents)
    const judges = get(judgesAtom)
    const usedJudgeIds = unique<number>(events.reduce<number[]>((acc, cur) => [...acc, ...cur.judges], []))

    return judges
      .filter(j => usedJudgeIds.includes(j.id))
      .sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
})

export const filterOrganizersQuery = selector({
  key: 'filterOrganizers',
  get: ({ get }) => {
    const events = get(filteredEvents)
    const uniqueOrganizesrs = uniqueFn<Organizer>(events.map(e => e.organizer), (a, b) => a.id === b.id)
    uniqueOrganizesrs.sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    return uniqueOrganizesrs
  },
})

export const filteredEvents = selector({
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
