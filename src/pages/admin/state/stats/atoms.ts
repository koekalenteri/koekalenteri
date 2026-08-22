import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'

export const adminStatsYearAtom = atom<number>(new Date().getFullYear())

/** Empty string means "all organizations the user has access to". */
export const adminStatsOrganizerIdAtom = atomWithLocalStorage<string>('adminStatsOrganizerId', '')

/** Empty string means "no event type selected yet" (no capacity chart to show). */
export const adminCapacityStatsEventTypeAtom = atomWithLocalStorage<string>('adminCapacityStatsEventType', '')

/** Sentinel for the capacity event type filter's "all event types" option, combining every type into one chart. */
export const ALL_EVENT_TYPES_ID = 'ALL'
