import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { getCapacityStats, getOrganizerEventStats } from '../../../../api/stats'
import { validIdTokenAtom } from '../../../state'

/**
 * All organizer event stats the user has access to, fetched once (unfiltered).
 * Year/organizer filtering happens client-side so switching the filter never re-fetches.
 */
export const adminOrganizerEventStatsAtom = atom(async (get) => {
  const token = await get(validIdTokenAtom)
  return token ? getOrganizerEventStats(token) : []
})

export const adminCapacityStatsAtom = atomFamily((eventType: string) =>
  atom(async () => (eventType ? getCapacityStats(eventType) : []))
)
