import { atomWithLazy } from 'jotai/utils'
import { currentYear, TIME_ZONE } from '@/lib/day'
import { atomWithLocalStorage } from '@/pages/state/storage'

/** This year, read when the atom is first used rather than when the module loads. */
export const adminStatsYearAtom = atomWithLazy<number>(() => currentYear(TIME_ZONE))

/** Empty string means "all organizations the user has access to". */
export const adminStatsOrganizerIdAtom = atomWithLocalStorage<string>('adminStatsOrganizerId', '')

/** Empty string means "no event type selected yet" (no capacity chart to show). */
export const adminCapacityStatsEventTypeAtom = atomWithLocalStorage<string>('adminCapacityStatsEventType', '')

/** Sentinel for the capacity event type filter's "all event types" option, combining every type into one chart. */
export const ALL_EVENT_TYPES_ID = 'ALL'
