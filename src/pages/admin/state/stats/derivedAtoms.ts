import { atom } from 'jotai'
import { userAtom } from '../../../state'
import { adminOrganizersAtom } from '../organizers/atoms'
import { adminOrganizerEventStatsAtom } from './remoteAtoms'

/**
 * Organizations the current user can view stats for: all of them for an admin, own roles
 * otherwise — further narrowed to organizations that actually have any recorded stats,
 * so the filter never offers a choice that would just show an empty chart.
 */
export const adminStatsOrganizersAtom = atom(async (get) => {
  const [user, organizers, allStats] = await Promise.all([
    get(userAtom),
    get(adminOrganizersAtom),
    get(adminOrganizerEventStatsAtom),
  ])
  const eligible = user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id])
  const organizerIdsWithStats = new Set(allStats.map((item) => item.organizerId).filter((id): id is string => !!id))

  return eligible.filter((organizer) => organizerIdsWithStats.has(organizer.id))
})
