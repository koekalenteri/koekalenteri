import i18next from 'i18next'
import { selector } from 'recoil'

import { officialFilterAtom, officialsAtom } from './atoms'


export const filteredOfficialsQuery = selector({
  key: 'filteredOfficials',
  get: ({ get }) => {
    const filter = get(officialFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(officialsAtom)

    if (!filter) {
      return list
    }
    return list.filter(official => [official.id, official.email, official.name, official.district, official.location, official.phone]
      .join(' ')
      .toLocaleLowerCase(i18next.language)
      .includes(filter))
  },
})
