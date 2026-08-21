import type { AllYearlyStatsResponse, YearlyStatsResponse } from '../../../api/stats'
import { atom, atomFamily } from 'recoil'
import { logEffect } from '../effects'
import { remoteAllYearlyStatsEffect, remoteYearlyStatsEffect } from './effects'

export const allYearlyStatsAtom = atom<AllYearlyStatsResponse>({
  default: { stats: [], years: [] },
  effects: [logEffect, remoteAllYearlyStatsEffect],
  key: 'allYearlyStats',
})

export const yearlyStatsAtom = atomFamily<YearlyStatsResponse, number>({
  effects: (year) => [logEffect, remoteYearlyStatsEffect(year)],
  key: 'yearlyStats',
})
