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

const eventSelector = selectorFamily<PublicDogEvent | null, string | undefined>({
  get:
    (eventId) =>
    ({ get }) => {
      if (!eventId) {
        return null
      }
      return get(eventsAtom).find((event) => event.id === eventId) ?? null
    },
  key: 'event',
})

export const confirmedEventSelector = selectorFamily<PublicConfirmedEvent | null, string | undefined>({
  get:
    (eventId) =>
    ({ get }) => {
      const event = get(eventSelector(eventId))
      return isConfirmedEvent(event) ? event : null
    },
  key: 'confirmedEvent',
})

export const filteredEventsSelector = selector({
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
  key: 'filteredEvents',
})

const filteredEventsForTypeSelector = selector({
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
  key: 'filteredEventsForType',
})

const filteredEventsForEventClassSelector = selector({
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
  key: 'filteredEventsForEventClass',
})

const filteredEventsForOrganizerSelector = selector({
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
  key: 'filteredEventsForOrganizer',
})

const filteredEventsForJudgeSelector = selector({
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
  key: 'filteredEventsForJudge',
})

export const filterEventTypesSelector = selector({
  get: ({ get }) => {
    const events = get(filteredEventsForTypeSelector)
    const uniqueEventTypes = unique<string>(events.map((e) => e.eventType))
    uniqueEventTypes.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventTypes
  },
  key: 'filterEventTypes',
})

export const filterEventClassesSelector = selector({
  get: ({ get }) => {
    const events = get(filteredEventsForEventClassSelector)
    const uniqueEventClasses = unique(
      events.reduce<EventClass[]>((acc, cur) => [...acc, ...cur.classes], []).map((ec) => ec.class)
    )
    uniqueEventClasses.sort((a, b) => a.localeCompare(b, i18next.language))
    return uniqueEventClasses
  },
  key: 'filterEventClasses',
})

const eventOrganizersSelector = selector({
  get: ({ get }) => {
    const events = get(eventsAtom)
    return uniqueFn(
      events.map((event) => event.organizer),
      (a, b) => a.id === b.id
    ).sort((a, b) => a.name.localeCompare(b.name, i18next.language))
  },
  key: 'eventOrganizers',
})

export const filterOrganizersSelector = selector({
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
  key: 'filterOrganizers',
})

export const filterJudgesSelector = selector({
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
  key: 'filterJudges',
})
