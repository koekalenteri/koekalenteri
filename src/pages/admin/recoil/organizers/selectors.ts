import type { Organizer } from '../../../../types'
import { selector, selectorFamily } from 'recoil'
import { adminOrganizerIdAtom, adminOrganizersAtom } from './atoms'

const adminOrganizerSelector = selectorFamily<Organizer | undefined, string | undefined>({
  get:
    (organizerId) =>
    ({ get }) => {
      const events = get(adminOrganizersAtom)
      return events.find((e) => e.id === organizerId)
    },
  key: 'adminOrganizerSelector',
})

export const adminCurrentOrganizerSelector = selector({
  get: ({ get }) => {
    const organizerId = get(adminOrganizerIdAtom)
    return organizerId ? get(adminOrganizerSelector(organizerId)) : undefined
  },
  key: 'adminCurrentOrganizerSelector',
})
