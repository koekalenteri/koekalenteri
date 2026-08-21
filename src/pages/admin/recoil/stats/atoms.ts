import type { AllYearlyStatsResponse } from '../../../../api/stats'
import type { EventStatsItem } from '../../../../types/Stats'
import { atom } from 'recoil'
import { localStorageEffect, logEffect } from '../../../recoil'
import { adminRemoteAllYearlyStatsEffect, adminRemoteOrganizerEventStatsEffect } from './effects'

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

export const adminAllYearlyStatsAtom = atom<AllYearlyStatsResponse>({
  default: { stats: [], years: [] },
  effects: [logEffect, adminRemoteAllYearlyStatsEffect],
  key: 'adminAllYearlyStats',
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
