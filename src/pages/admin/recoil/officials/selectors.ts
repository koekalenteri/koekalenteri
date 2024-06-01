import i18next from 'i18next'
import { selector } from 'recoil'

import { adminOfficialFilterAtom, adminOfficialsAtom } from './atoms'

export const adminFilteredOfficialsSelector = selector({
  key: 'adminFilteredOfficials',
  get: ({ get }) => {
    const filter = get(adminOfficialFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminOfficialsAtom)

    if (!filter) {
      return list
    }
    return list.filter((official) =>
      [official.id, official.email, official.name, official.district, official.location, official.phone]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
  },
})
