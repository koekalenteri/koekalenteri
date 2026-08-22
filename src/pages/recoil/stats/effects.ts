import type { AtomEffect } from 'recoil'
import type { AllYearlyStatsResponse } from '../../../api/stats'
import { getAllYearlyStats } from '../../../api/stats'

export const remoteAllYearlyStatsEffect: AtomEffect<AllYearlyStatsResponse> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(getAllYearlyStats())
  }
}
