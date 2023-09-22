import type { Organizer } from 'koekalenteri-shared/model'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { adminOrganizerFilterAtom, adminOrganizerIdAtom, adminOrganizersAtom } from './atoms'

export const filteredOrganizersSelector = selector({
  key: 'filteredOrganizers',
  get: ({ get }) => {
    const filter = get(adminOrganizerFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminOrganizersAtom)

    return filter ? list.filter((o) => o.name.toLocaleLowerCase(i18next.language).includes(filter)) : list
  },
})

export const adminOrganizerSelector = selectorFamily<Organizer | undefined, string | undefined>({
  key: 'adminOrganizerSelector',
  get:
    (organizerId) =>
    ({ get }) => {
      const events = get(adminOrganizersAtom)
      return events.find((e) => e.id === organizerId)
    },
})

export const currentAdminOrganizerSelector = selector({
  key: 'currentAdminOrganizerSelector',
  get: ({ get }) => {
    const organizerId = get(adminOrganizerIdAtom)
    return organizerId ? get(adminOrganizerSelector(organizerId)) : undefined
  },
})
