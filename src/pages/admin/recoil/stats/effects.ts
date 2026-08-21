import type { AtomEffect } from 'recoil'
import type { AllYearlyStatsResponse } from '../../../../api/stats'
import type { EventStatsItem } from '../../../../types/Stats'
import { DefaultValue } from 'recoil'
import { getAllYearlyStats, getOrganizerEventStats } from '../../../../api/stats'
import { validIdTokenSelector } from '../../../recoil'

export const adminRemoteAllYearlyStatsEffect: AtomEffect<AllYearlyStatsResponse> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(getAllYearlyStats())
  }
}

export const adminRemoteOrganizerEventStatsEffect: AtomEffect<EventStatsItem[]> = ({
  getPromise,
  setSelf,
  trigger,
}) => {
  if (trigger === 'get') {
    const load = async (): Promise<EventStatsItem[] | DefaultValue> => {
      const token = await getPromise(validIdTokenSelector)
      return token ? getOrganizerEventStats(token) : new DefaultValue()
    }
    setSelf(load())
  }
}
