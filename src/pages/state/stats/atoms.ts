import { atom } from 'jotai'
import { getAllYearlyStats } from '../../../api/stats'

export const allYearlyStatsAtom = atom(async () => getAllYearlyStats())
