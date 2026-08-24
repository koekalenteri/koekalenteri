import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { getAdminCapacityStats, getAdminJudgeWorkload, getOrganizerEventStats } from '../../../../api/stats'
import { validIdTokenAtom } from '../../../state'
import { adminActiveEventTypesAtom } from '../eventTypes/derivedAtoms'
import { ALL_EVENT_TYPES_ID } from './atoms'

/**
 * All organizer event stats the user has access to, fetched once (unfiltered).
 * Year/organizer filtering happens client-side so switching the filter never re-fetches.
 */
export const adminOrganizerEventStatsAtom = atom(async (get) => {
  const token = get(validIdTokenAtom)
  return token ? getOrganizerEventStats(token) : []
})

/**
 * Keyed by `${eventType}|${organizerId}` so switching either the event type or the organizer
 * filter re-fetches. eventType === ALL_EVENT_TYPES_ID fans out to every type the picker offers
 * and merges the results; the chart itself sums across event types/classes as needed.
 *
 * The fan-out reads the same active event types the picker is built from rather than a static
 * list, so "all" cannot silently omit a type the user can otherwise select on its own.
 *
 * Goes to the admin endpoint, not the public /stats one: per-organizer figures require
 * admin-or-memberOf, and an empty organizerId there means "every organizer I belong to".
 */
// unwrap keeps serving the previous result synchronously while the new key's fetch is in
// flight, instead of re-suspending (and remounting the page) whenever the event type or
// organizer picker selects a key that hasn't been fetched yet.
export const adminCapacityStatsAtom = atomFamily((key: string) =>
  unwrap(
    atom(async (get) => {
      const [eventType, organizerId] = key.split('|')
      const token = get(validIdTokenAtom)
      if (!eventType || !token) return []
      if (eventType === ALL_EVENT_TYPES_ID) {
        const eventTypes = await get(adminActiveEventTypesAtom)
        const results = await Promise.all(
          eventTypes.map((et) => getAdminCapacityStats(token, et.eventType, organizerId))
        )
        return results.flat()
      }
      return getAdminCapacityStats(token, eventType, organizerId)
    }),
    (prev) => prev ?? []
  )
)

/** Per-judge event counts for one year. Not organizer-scoped, so keyed by year alone. */
export const adminJudgeWorkloadAtom = atomFamily((year: number) =>
  unwrap(
    atom(async (get) => {
      const token = get(validIdTokenAtom)
      if (!token) return []
      return getAdminJudgeWorkload(token, year)
    }),
    (prev) => prev ?? []
  )
)
