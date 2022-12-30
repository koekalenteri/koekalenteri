
import i18next from 'i18next'
import { EventEx, Organizer } from 'koekalenteri-shared/model'
import { atom, selector, selectorFamily } from 'recoil'
import { syncEffect } from 'recoil-sync'

import { getEvent, getEvents } from '../../api/event'
import { unique, uniqueFn } from '../../utils'

import { logEffect, storageEffect } from './effects'
import { judgesAtom } from './judges'

export const eventsAtom = atom<EventEx[]>({
  key: 'events',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    ({setSelf, trigger}) => {
      if (trigger === 'get') {
        getEvents().then(setSelf)
      }
    },
  ],
})

export const eventIdAtom = atom<string | undefined>({
  key: 'eventId',
  default: undefined,
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const eventByIdAtom = selectorFamily<EventEx | undefined, string>({
  key: 'adminEvents/eventId',
  get: (eventId) => ({ get }) => get(eventsAtom).find(event => event.id === eventId) ?? getEvent(eventId),
})

export const eventSelector = selectorFamily<EventEx | undefined, string>({
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

export const eventFilterAtom = atom<FilterProps>({
  key: 'eventFilter',
  default: {
    start: null,
    end: null,
    withOpenEntry: false,
    withUpcomingEntry: false,
    withClosingEntry: false,
    withFreePlaces: false,
    eventType: [],
    eventClass: [],
    judge: [],
    organizer: [],
  },
  effects: [
    logEffect,
    syncEffect({ refine: (v) => ({ type: 'success', value: v, warnings: []}) }),
  ],
})

export const filteredEvents = selector({
  key: 'filteredEvents',
  get: ({get}) => {
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

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  eventType: string[]
  eventClass: string[]
  judge: number[]
  organizer: number[]
}

function withinDateFilters(event: EventEx, { start, end }: FilterProps) {
  if (start && (!event.endDate || event.endDate < start)) {
    return false
  }
  if (end && (!event.startDate || event.startDate > end)) {
    return false
  }
  return true
}

function withinSwitchFilters(event: EventEx, { withOpenEntry, withClosingEntry, withUpcomingEntry, withFreePlaces }: FilterProps) {
  let result

  if (withOpenEntry) {
    result =  event.isEntryOpen
    if (withClosingEntry) {
      result = result && event.isEntryClosing
    }
    if (withFreePlaces) {
      result = result && event.places > event.entries
    }
  }

  if (withUpcomingEntry) {
    result = result || event.isEntryUpcoming
  }

  return result !== false
}

function withinArrayFilters(event: EventEx, { eventType, eventClass, judge, organizer }: FilterProps) {
  if (eventType.length && !eventType.includes(event.eventType)) {
    return false
  }
  if (eventClass.length && !eventClass.some(c => event.classes.map(cl => cl.class).includes(c))) {
    return false
  }
  if (judge.length && !judge.some(j => event.judges?.includes(j))) {
    return false
  }
  if (organizer.length && !organizer.includes(event.organizer?.id)) {
    return false
  }
  return true
}
