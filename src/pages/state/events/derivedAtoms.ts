import type { PublicJudge } from '@/types'
import type { EventFilterFacet } from './filters'
import i18next from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { compareByLocalizedString } from '@/lib/client/sort'
import { isRegistrationClass } from '@/lib/registration'
import { unique, uniqueFn } from '@/lib/utils'
import { eventFilterAtom, eventsAtom } from './atoms'
import { matchesEventFilter } from './filters'

export const eventAtom = atomFamily((eventId: string | undefined) =>
  atom((get) => (eventId ? get(eventsAtom).find((event) => event.id === eventId) : null))
)

const filteredEventsExcept = (facet?: EventFilterFacet) =>
  atom((get) => {
    const filter = get(eventFilterAtom)
    return get(eventsAtom).filter((event) => matchesEventFilter(event, filter, facet))
  })

export const filteredEventsAtom = filteredEventsExcept()
const filteredEventsForTypeAtom = filteredEventsExcept('eventType')
const filteredEventsForEventClassAtom = filteredEventsExcept('eventClass')
const filteredEventsForOrganizerAtom = filteredEventsExcept('organizer')
const filteredEventsForJudgeAtom = filteredEventsExcept('judge')

export const filterEventTypesAtom = atom((get) => {
  const events = get(filteredEventsForTypeAtom)
  const uniqueEventTypes = unique<string>(events.map((e) => e.eventType))
  uniqueEventTypes.sort((a, b) => a.localeCompare(b, i18next.language))
  return uniqueEventTypes
})

export const filterEventClassesAtom = atom((get) => {
  const events = get(filteredEventsForEventClassAtom)
  const eventClasses = events.flatMap((event) => event.classes)
  // The calendar filters by the official classes alone; an event's own class is no filter (KOE-674).
  const uniqueEventClasses = unique(eventClasses.map((eventClass) => eventClass.class).filter(isRegistrationClass))
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
