import type { ConfirmedEvent, DogEvent, EventClass } from '../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { isConfirmedEvent } from '../../../lib/typeGuards'
import { unique, uniqueFn } from '../../../utils'
import { judgesAtom } from '../judges/atoms'

import { eventFilterAtom, eventIdAtom, eventsAtom } from './atoms'
import {
  withinDateFilters,
  withinEventTypeClassFilter,
  withinEventTypeFilter,
  withinJudgeFilter,
  withinOrganizerFilter,
  withinSwitchFilters,
} from './filters'

export const eventSelector = selectorFamily<DogEvent | null, string | undefined>({
  key: 'event',
  get:
    (eventId) =>
    ({ get }) => {
      if (!eventId) {
        return null
      }
      return get(eventsAtom).find((event) => event.id === eventId) ?? null
    },
})

export const confirmedEventSelector = selectorFamily<ConfirmedEvent | null, string | undefined>({
  key: 'confirmedEvent',
  get:
    (eventId) =>
    ({ get }) => {
      const event = get(eventSelector(eventId))
      return isConfirmedEvent(event) ? event : null
    },
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

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        !event.deletedAt &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinOrganizerFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

export const filteredEventsForTypeSelector = selector({
  key: 'filteredEventsForType',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        !event.deletedAt &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinOrganizerFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

export const filteredEventsForEventClassSelector = selector({
  key: 'filteredEventsForEventClass',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        !event.deletedAt &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinOrganizerFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

export const filteredEventsForOrganizerSelector = selector({
  key: 'filteredEventsForOrganizer',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        !event.deletedAt &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

export const filteredEventsForJudgeSelector = selector({
  key: 'filteredEventsForJudge',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        !event.deletedAt &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinOrganizerFilter(event, filter)
      )
    })
  },
})

export const filterEventTypesSelector = selector({
  key: 'filterEventTypes',
  get: ({ get }) => {
    const events = get(filteredEventsForTypeSelector)
    const uniqueEventTypes = unique<string>(events.map((e) => e.eventType))
    uniqueEventTypes.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventTypes
  },
})

export const filterEventClassesSelector = selector({
  key: 'filterEventClasses',
  get: ({ get }) => {
    const events = get(filteredEventsForEventClassSelector)
    const uniqueEventClasses = unique(
      events.reduce<EventClass[]>((acc, cur) => [...acc, ...cur.classes], []).map((ec) => ec.class)
    )
    uniqueEventClasses.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventClasses
  },
})

const eventOrganizersSelector = selector({
  key: 'eventOrganizers',
  get: ({ get }) => {
    const events = get(eventsAtom)
    return uniqueFn(
      events.map((event) => event.organizer),
      (a, b) => a.id === b.id
    ).sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
})

export const filterOrganizersSelector = selector({
  key: 'filterOrganizers',
  get: ({ get }) => {
    const events = get(filteredEventsForOrganizerSelector)
    const organizers = get(eventOrganizersSelector)
    const filter = get(eventFilterAtom)
    const usedOrganizerIds = unique<string>(
      events.reduce<string[]>((acc, cur) => [...acc, cur.organizer.id], [...filter.organizer])
    )

    return organizers
      .filter((o) => usedOrganizerIds.includes(o.id))
      .sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
})

export const filterJudgesSelector = selector({
  key: 'filterJudges',
  get: ({ get }) => {
    const events = get(filteredEventsForJudgeSelector)
    const filter = get(eventFilterAtom)
    const judges = get(judgesAtom)
    const usedJudgeIds = unique<number>(
      events.reduce<number[]>((acc, cur) => [...acc, ...cur.judges], [...filter.judge])
    )

    return judges
      .filter((j) => usedJudgeIds.includes(j.id))
      .sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
})

export const eventPricesSelector = selector({
  key: 'eventPricesSelector',
  get: ({ get }) =>
    unique<number>(get(eventsAtom).map((e) => e.cost))
      .filter(Boolean)
      .sort((a, b) => a - b),
})

export const eventMemerPricesSelector = selector({
  key: 'eventMemberPricesSelector',
  get: ({ get }) =>
    unique<number>(get(eventsAtom).map((e) => e.costMember))
      .filter(Boolean)
      .sort((a, b) => a - b),
})
