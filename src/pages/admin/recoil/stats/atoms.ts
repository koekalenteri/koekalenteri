import type { CapacityStatsEntry, EventStatsItem } from '../../../../types/Stats'
import { atom, atomFamily } from 'recoil'
import { localStorageEffect, logEffect } from '../../../recoil'
import { adminRemoteCapacityStatsEffect, adminRemoteOrganizerEventStatsEffect } from './effects'

export const adminStatsYearAtom = atom<number>({
  default: new Date().getFullYear(),
  key: 'adminStatsYear',
})

/** Empty string means "all organizations the user has access to". */
export const adminStatsOrganizerIdAtom = atom<string>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminStatsOrganizerId',
})

/**
 * All organizer event stats the user has access to, fetched once (unfiltered).
 * Year/organizer filtering happens client-side so switching the filter never re-fetches.
 */
export const adminOrganizerEventStatsAtom = atom<EventStatsItem[]>({
  default: [],
  effects: [logEffect, adminRemoteOrganizerEventStatsEffect],
  key: 'adminOrganizerEventStats',
})

/** Empty string means "no event type selected yet" (no capacity chart to show). */
export const adminCapacityStatsEventTypeAtom = atom<string>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminCapacityStatsEventType',
})

export const adminCapacityStatsAtom = atomFamily<CapacityStatsEntry[], string>({
  default: [],
  effects: (eventType) => [logEffect, adminRemoteCapacityStatsEffect(eventType)],
  key: 'adminCapacityStats',
})
