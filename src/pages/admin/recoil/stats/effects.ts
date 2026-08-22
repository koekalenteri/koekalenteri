import type { AtomEffect } from 'recoil'
import type { CapacityStatsEntry, EventStatsItem } from '../../../../types/Stats'
import { DefaultValue } from 'recoil'
import { getCapacityStats, getOrganizerEventStats } from '../../../../api/stats'
import { validIdTokenSelector } from '../../../recoil'

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

export const adminRemoteCapacityStatsEffect =
  (eventType: string): AtomEffect<CapacityStatsEntry[]> =>
  ({ setSelf, trigger }) => {
    if (trigger === 'get' && eventType) {
      setSelf(getCapacityStats(eventType))
    }
  }
