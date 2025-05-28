import type { EventClass, PublicConfirmedEvent, PublicDogEvent, PublicJudge } from '../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { isConfirmedEvent } from '../../../lib/typeGuards'
import { unique, uniqueFn } from '../../../lib/utils'

import { eventFilterAtom, eventsAtom } from './atoms'
import {
  withinDateFilters,
  withinEventTypeClassFilter,
  withinEventTypeFilter,
  withinJudgeFilter,
  withinOrganizerFilter,
  withinSwitchFilters,
} from './filters'

export const eventSelector = selectorFamily<PublicDogEvent | null, string | undefined>({
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

export const confirmedEventSelector = selectorFamily<PublicConfirmedEvent | null, string | undefined>({
  key: 'confirmedEvent',
  get:
    (eventId) =>
    ({ get }) => {
      const event = get(eventSelector(eventId))
      return isConfirmedEvent(event) ? event : null
    },
})

export const filteredEventsSelector = selector({
  key: 'filteredEvents',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
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

const filteredEventsForTypeSelector = selector({
  key: 'filteredEventsForType',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinOrganizerFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

const filteredEventsForEventClassSelector = selector({
  key: 'filteredEventsForEventClass',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinOrganizerFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

const filteredEventsForOrganizerSelector = selector({
  key: 'filteredEventsForOrganizer',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
        withinDateFilters(event, filter) &&
        withinSwitchFilters(event, filter) &&
        withinEventTypeFilter(event, filter) &&
        withinEventTypeClassFilter(event, filter) &&
        withinJudgeFilter(event, filter)
      )
    })
  },
})

const filteredEventsForJudgeSelector = selector({
  key: 'filteredEventsForJudge',
  get: ({ get }) => {
    const filter = get(eventFilterAtom)
    const events = get(eventsAtom)

    return events.filter((event) => {
      return (
        event.state !== 'draft' &&
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
    const usedJudges = uniqueFn<PublicJudge>(
      events.reduce<PublicJudge[]>((acc, cur) => [...acc, ...cur.judges], []),
      (a, b) => a.name === b.name
    ).filter((j) => j.name) // remove empty
    usedJudges.sort((a, b) => {
      const level = Number(filter.judge.includes(a.name)) - Number(filter.judge.includes(b.name))

      return level === 0 ? a.name.localeCompare(b.name, i18next.language) : level
    })

    return usedJudges
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
