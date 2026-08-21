import { selector } from 'recoil'
import { userSelector } from '../../../recoil'
import { adminOrganizersAtom } from '../organizers/atoms'
import { adminOrganizerEventStatsAtom } from './atoms'

/**
 * Organizations the current user can view stats for: all of them for an admin, own roles
 * otherwise — further narrowed to organizations that actually have any recorded stats,
 * so the filter never offers a choice that would just show an empty chart.
 */
export const adminStatsOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminOrganizersAtom)
    const eligible = user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id])

    const allStats = get(adminOrganizerEventStatsAtom)
    const organizerIdsWithStats = new Set(allStats.map((item) => item.organizerId).filter((id): id is string => !!id))

    return eligible.filter((organizer) => organizerIdsWithStats.has(organizer.id))
  },
  key: 'adminStatsOrganizers',
})
