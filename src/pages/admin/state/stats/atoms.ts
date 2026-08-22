import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'

export const adminStatsYearAtom = atom<number>(new Date().getFullYear())

/** Empty string means "all organizations the user has access to". */
export const adminStatsOrganizerIdAtom = atomWithLocalStorage<string>('adminStatsOrganizerId', '')

/** Empty string means "no event type selected yet" (no capacity chart to show). */
export const adminCapacityStatsEventTypeAtom = atomWithLocalStorage<string>('adminCapacityStatsEventType', '')
