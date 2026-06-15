import type { PublicDogEvent } from '../../../types'
import type { EventMetadata, FilterProps } from './types'
import { atom } from 'recoil'
import { zonedStartOfDay } from '../../../i18n/dates'
import { getStorageEffect, localStorageEffect, logEffect } from '../effects'
import { urlSyncEffect } from './effects'

export const EVENT_METADATA_INVALIDATED_STORAGE_KEY = 'eventMetadataInvalidated'

const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.valueOf())

const isStoredPublicDogEvent = (value: unknown): value is PublicDogEvent => {
  if (!value || typeof value !== 'object') return false

  const event = value as Partial<PublicDogEvent>

  return (
    typeof event.id === 'string' &&
    !!event.id &&
    typeof event.eventType === 'string' &&
    typeof event.state === 'string' &&
    event.state !== 'draft' &&
    isValidDate(event.startDate) &&
    isValidDate(event.endDate) &&
    !!event.organizer?.id
  )
}

const refineStoredEvents = (value: unknown): PublicDogEvent[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const events = value.filter(isStoredPublicDogEvent)
  return events.length === value.length ? value : events
}

const eventsStorageEffect = getStorageEffect<PublicDogEvent[]>(localStorage, {
  onRefined: () => {
    localStorage.removeItem('eventMetadata')
    localStorage.setItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY, 'true')
  },
  refine: refineStoredEvents,
})

export const eventsAtom = atom<PublicDogEvent[]>({
  default: [],
  effects: [logEffect, eventsStorageEffect],
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
