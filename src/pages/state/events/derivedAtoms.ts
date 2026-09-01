import type { PublicJudge } from '../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { compareByLocalizedString } from '../../../lib/client/sort'
import { unique, uniqueFn } from '../../../lib/utils'
import { eventFilterAtom, eventsAtom } from './atoms'
import {
  withinDateFilters,
  withinEventTypeClassFilter,
  withinEventTypeFilter,
  withinJudgeFilter,
  withinOrganizerFilter,
  withinResultsFilter,
  withinSwitchFilters,
} from './filters'

export const eventAtom = atomFamily((eventId: string | undefined) =>
  atom((get) => (eventId ? get(eventsAtom).find((event) => event.id === eventId) : null))
)

export const filteredEventsAtom = atom((get) => {
  const filter = get(eventFilterAtom)
  const events = get(eventsAtom)

  return events.filter((event) => {
    return (
      event.state !== 'draft' &&
      withinDateFilters(event, filter) &&
      withinSwitchFilters(event, filter) &&
      withinResultsFilter(event, filter) &&
      withinEventTypeFilter(event, filter) &&
      withinEventTypeClassFilter(event, filter) &&
      withinOrganizerFilter(event, filter) &&
      withinJudgeFilter(event, filter)
    )
  })
})

const filteredEventsForTypeAtom = atom((get) => {
  const filter = get(eventFilterAtom)
  const events = get(eventsAtom)

  return events.filter((event) => {
    return (
      event.state !== 'draft' &&
      withinDateFilters(event, filter) &&
      withinSwitchFilters(event, filter) &&
      withinResultsFilter(event, filter) &&
      withinEventTypeClassFilter(event, filter) &&
      withinOrganizerFilter(event, filter) &&
      withinJudgeFilter(event, filter)
    )
  })
})

const filteredEventsForEventClassAtom = atom((get) => {
  const filter = get(eventFilterAtom)
  const events = get(eventsAtom)

  return events.filter((event) => {
    return (
      event.state !== 'draft' &&
      withinDateFilters(event, filter) &&
      withinSwitchFilters(event, filter) &&
      withinResultsFilter(event, filter) &&
      withinEventTypeFilter(event, filter) &&
      withinOrganizerFilter(event, filter) &&
      withinJudgeFilter(event, filter)
    )
  })
})

const filteredEventsForOrganizerAtom = atom((get) => {
  const filter = get(eventFilterAtom)
  const events = get(eventsAtom)

  return events.filter((event) => {
    return (
      event.state !== 'draft' &&
      withinDateFilters(event, filter) &&
      withinSwitchFilters(event, filter) &&
      withinResultsFilter(event, filter) &&
      withinEventTypeFilter(event, filter) &&
      withinEventTypeClassFilter(event, filter) &&
      withinJudgeFilter(event, filter)
    )
  })
})

const filteredEventsForJudgeAtom = atom((get) => {
  const filter = get(eventFilterAtom)
  const events = get(eventsAtom)

  return events.filter((event) => {
    return (
      event.state !== 'draft' &&
      withinDateFilters(event, filter) &&
      withinSwitchFilters(event, filter) &&
      withinResultsFilter(event, filter) &&
      withinEventTypeFilter(event, filter) &&
      withinEventTypeClassFilter(event, filter) &&
      withinOrganizerFilter(event, filter)
    )
  })
})

export const filterEventTypesAtom = atom((get) => {
  const events = get(filteredEventsForTypeAtom)
  const uniqueEventTypes = unique<string>(events.map((e) => e.eventType))
  uniqueEventTypes.sort((a, b) => a.localeCompare(b, i18next.language))
  return uniqueEventTypes
})

export const filterEventClassesAtom = atom((get) => {
  const events = get(filteredEventsForEventClassAtom)
  const eventClasses = events.flatMap((event) => event.classes)
  const uniqueEventClasses = unique(eventClasses.map((eventClass) => eventClass.class))
  uniqueEventClasses.sort((a, b) => a.localeCompare(b, i18next.language))
  return uniqueEventClasses
})

const eventOrganizersAtom = atom((get) => {
  const events = get(eventsAtom)
  const organizers = events.map((event) => event.organizer).filter((organizer) => organizer?.id && organizer.name)

  return uniqueFn(organizers, (a, b) => a.id === b.id).sort(compareByLocalizedString('name'))
})

export const filterOrganizersAtom = atom((get) => {
  const events = get(filteredEventsForOrganizerAtom)
  const organizers = get(eventOrganizersAtom)
  const filter = get(eventFilterAtom)
  const usedOrganizerIds = unique<string>([
    ...filter.organizer,
    ...events.map((event) => event.organizer?.id).filter((id): id is string => !!id),
  ])

  return organizers.filter((o) => usedOrganizerIds.includes(o.id)).sort(compareByLocalizedString('name'))
})

export const filterJudgesAtom = atom((get) => {
  const events = get(filteredEventsForJudgeAtom)
  const filter = get(eventFilterAtom)
  const judges = events.flatMap((event) => event.judges)
  const usedJudges = uniqueFn<PublicJudge>(judges, (a, b) => a.name === b.name).filter((j) => j.name) // remove empty
  const compareByName = compareByLocalizedString('name')
  usedJudges.sort((a, b) => {
    const level = Number(filter.judge.includes(a.name)) - Number(filter.judge.includes(b.name))

    return level === 0 ? compareByName(a, b) : level
  })

  return usedJudges
})
