import i18next from 'i18next'
import { selector } from 'recoil'

import { adminOrganizerFilterAtom, adminOrganizersAtom } from './atoms'

export const filteredOrganizersSelector = selector({
  key: 'filteredOrganizers',
  get: ({ get }) => {
    const filter = get(adminOrganizerFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminOrganizersAtom)

    return filter ? list.filter((o) => o.name.toLocaleLowerCase(i18next.language).includes(filter)) : list
  },
})
