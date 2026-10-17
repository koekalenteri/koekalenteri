import { atom } from 'jotai'
import { TIME_ZONE, yearOf } from '@/lib/day'
import { atomWithLocalStorage } from '@/pages/state/storage'

// Read when the module loads: the default year before the picker is touched (see freezeClockNow for tests).
export const adminStatsYearAtom = atom<number>(yearOf(new Date(), TIME_ZONE))

/** Empty string means "all organizations the user has access to". */
export const adminStatsOrganizerIdAtom = atomWithLocalStorage<string>('adminStatsOrganizerId', '')

/** Empty string means "no event type selected yet" (no capacity chart to show). */
export const adminCapacityStatsEventTypeAtom = atomWithLocalStorage<string>('adminCapacityStatsEventType', '')

/** Sentinel for the capacity event type filter's "all event types" option, combining every type into one chart. */
export const ALL_EVENT_TYPES_ID = 'ALL'
