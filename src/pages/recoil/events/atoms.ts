import type { PublicDogEvent, RegistrationClass } from '../../../types'

import { atom } from 'recoil'

import { zonedStartOfDay } from '../../../i18n/dates'
import { localStorageEffect, logEffect } from '../effects'

import { remoteEventsEffect, urlSyncEffect } from './effects'

export const eventsAtom = atom<PublicDogEvent[]>({
  key: 'events',
  effects: [logEffect, localStorageEffect, remoteEventsEffect],
})

export type FilterProps = {
  start: Date | null
  end: Date | null
  withOpenEntry?: boolean
  withClosingEntry?: boolean
  withUpcomingEntry?: boolean
  withFreePlaces?: boolean
  eventType: string[]
  eventClass: RegistrationClass[]
  judge: string[]
  organizer: string[]
}

export const eventFilterAtom = atom<FilterProps>({
  key: 'eventFilter',
  default: {
    start: zonedStartOfDay(new Date()),
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
