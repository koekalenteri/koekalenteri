import type { PublicDogEvent } from '../../../types'
import type { FilterProps } from './types'
import { atom } from 'recoil'
import { zonedStartOfDay } from '../../../i18n/dates'
import { localStorageEffect, logEffect } from '../effects'
import { remoteEventsEffect, urlSyncEffect } from './effects'

export const eventsAtom = atom<PublicDogEvent[]>({
  effects: [logEffect, localStorageEffect, remoteEventsEffect],
  key: 'events',
})

export const eventFilterAtom = atom<FilterProps>({
  default: {
    end: null,
    eventClass: [],
    eventType: [],
    judge: [],
    organizer: [],
    start: zonedStartOfDay(new Date()),
    withClosingEntry: false,
    withFreePlaces: false,
    withOpenEntry: false,
    withUpcomingEntry: false,
  },
  effects: [logEffect, urlSyncEffect],
  key: 'eventFilter',
})
