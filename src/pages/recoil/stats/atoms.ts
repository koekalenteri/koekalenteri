import type { AllYearlyStatsResponse } from '../../../api/stats'
import { atom } from 'recoil'
import { logEffect } from '../effects'
import { remoteAllYearlyStatsEffect } from './effects'

export const allYearlyStatsAtom = atom<AllYearlyStatsResponse>({
  default: { stats: [], years: [] },
  effects: [logEffect, remoteAllYearlyStatsEffect],
  key: 'allYearlyStats',
})
