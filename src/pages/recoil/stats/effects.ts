import type { AtomEffect } from 'recoil'
import type { AllYearlyStatsResponse, YearlyStatsResponse } from '../../../api/stats'
import { getAllYearlyStats, getYearlyStats } from '../../../api/stats'

export const remoteAllYearlyStatsEffect: AtomEffect<AllYearlyStatsResponse> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(getAllYearlyStats())
  }
}

export const remoteYearlyStatsEffect =
  (year: number): AtomEffect<YearlyStatsResponse> =>
  ({ setSelf, trigger }) => {
    if (trigger === 'get') {
      setSelf(getYearlyStats(year))
    }
  }
