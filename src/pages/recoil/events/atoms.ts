import type { PublicDogEvent } from '../../../types'
import type { EventMetadata, FilterProps } from './types'
import { atom } from 'recoil'
import { zonedStartOfDay } from '../../../i18n/dates'
import { localStorageEffect, logEffect } from '../effects'
import { urlSyncEffect } from './effects'

export const eventsAtom = atom<PublicDogEvent[]>({
  default: [],
  effects: [logEffect, localStorageEffect],
  key: 'events',
})

export const eventMetadataAtom = atom<EventMetadata>({
  default: { singles: {} },
  effects: [logEffect, localStorageEffect],
  key: 'eventMetadata',
})

export const eventsLoadingAtom = atom<boolean>({
  default: false,
  effects: [logEffect],
  key: 'eventsLoading',
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
