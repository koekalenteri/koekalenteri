import { startOfDay } from 'date-fns'
import { Event } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../effects'

import { remoteEventsEffect, urlSyncEffect } from './effects'

export const eventsAtom = atom<Event[]>({
  key: 'events',
  effects: [logEffect, storageEffect, remoteEventsEffect],
})

export const eventIdAtom = atom<string | undefined>({
  key: 'eventId',
  default: '',
  effects: [logEffect, storageEffect],
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

export const eventFilterAtom = atom<FilterProps>({
  key: 'eventFilter',
  default: {
    start: startOfDay(new Date()),
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
  effects: [logEffect, urlSyncEffect],
})
