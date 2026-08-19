import type { PublicDogEvent } from '../../../types'
import type { EventMetadata, FilterProps } from './types'
import { atom } from 'jotai'
import { atomWithLazy } from 'jotai/utils'
import { zonedStartOfDay } from '../../../i18n/dates'
import { atomWithLocalStorage } from '../storage'
import { deserializeFilter, serializeFilter } from './filters'

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

const eventsStorageOptions = {
  onRefined: () => {
    localStorage.removeItem('eventMetadata')
    localStorage.setItem(EVENT_METADATA_INVALIDATED_STORAGE_KEY, 'true')
  },
  refine: refineStoredEvents,
}

export const eventsAtom = atomWithLocalStorage<PublicDogEvent[]>('events', [], eventsStorageOptions)

export const eventMetadataAtom = atomWithLocalStorage<EventMetadata>('eventMetadata', { singles: {} })

export const eventsLoadingAtom = atom(false)

const defaultFilter = (): FilterProps => ({
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
})

const initialFilter = () => {
  if (globalThis.location.search || globalThis.location.href.endsWith('?')) {
    return deserializeFilter(globalThis.location.search)
  }
  const sessionValue = sessionStorage.getItem('eventFilter')
  if (sessionValue === null) return defaultFilter()
  const newUrl = `${globalThis.location.origin + globalThis.location.pathname}?${sessionValue}`
  globalThis.history.pushState({ path: newUrl }, '', newUrl)
  return deserializeFilter(sessionValue)
}

const eventFilterValueAtom = atomWithLazy(initialFilter)
export const eventFilterAtom = atom(
  (get) => get(eventFilterValueAtom),
  (get, set, update: FilterProps | ((previous: FilterProps) => FilterProps)) => {
    const previous = get(eventFilterValueAtom)
    const next = typeof update === 'function' ? update(previous) : update
    set(eventFilterValueAtom, next)
    const newSearch = serializeFilter(next)
    if (serializeFilter(previous) === newSearch) return
    const newUrl = `${globalThis.location.origin + globalThis.location.pathname}?${newSearch}`
    globalThis.history.pushState({ path: newUrl }, '', newUrl)
    sessionStorage.setItem('eventFilter', newSearch)
  }
)
