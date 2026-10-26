import { atom } from 'jotai'
import { allMaybe, mapMaybe } from '@/lib/maybePromise'
import { userAtom } from '@/pages/state'
import { adminOrganizersAtom } from '../organizers/atoms'
import { adminOrganizerEventStatsAtom } from './remoteAtoms'

/**
 * Organizations the current user can view stats for: all of them for an admin, own roles
 * otherwise — further narrowed to organizations that actually have any recorded stats,
 * so the filter never offers a choice that would just show an empty chart.
 *
 * Not an `async` getter: that returns a new Promise on every call, and a refreshed id token would
 * then suspend the stats page and swap it for its Suspense fallback.
 */
export const adminStatsOrganizersAtom = atom((get) =>
  mapMaybe(
    allMaybe([get(userAtom), get(adminOrganizersAtom), get(adminOrganizerEventStatsAtom)]),
    ([user, organizers, allStats]) => {
      const eligible = user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id])
      const organizerIdsWithStats = new Set(allStats.map((item) => item.organizerId).filter((id): id is string => !!id))

      return eligible.filter((organizer) => organizerIdsWithStats.has(organizer.id))
    }
  )
)
