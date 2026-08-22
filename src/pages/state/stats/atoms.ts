import { atom } from 'jotai'
import { getAllYearlyStats, getCapacityStats } from '../../../api/stats'
import { ALL_EVENT_TYPES_FOR_CAPACITY } from '../../../types/Stats'

export const allYearlyStatsAtom = atom(async () => getAllYearlyStats())

// Nationwide, across every active event type -- a single type's places are set by competition
// rules, so only a cross-type fill-rate says anything about actual demand.
export const capacityStatsAtom = atom(async () => getCapacityStats(ALL_EVENT_TYPES_FOR_CAPACITY))
