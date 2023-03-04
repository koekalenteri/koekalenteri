import i18next from 'i18next'
import { selector } from 'recoil'

import { organizerFilterAtom, organizersAtom } from './atoms'

export const filteredOrganizersSelector = selector({
  key: 'filteredOrganizers',
  get: ({ get }) => {
    const filter = get(organizerFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(organizersAtom)

    return filter ? list.filter((o) => o.name.toLocaleLowerCase(i18next.language).includes(filter)) : list
  },
})
