
import i18next from 'i18next'
import { Official } from 'koekalenteri-shared/model'
import { atom, selector, useSetRecoilState } from 'recoil'

import { getOfficials } from '../../api/official'

import { logEffect, storageEffect } from './effects'

export const officialsAtom = atom<Official[]>({
  key: 'officials',
  default: getOfficials(),
  effects: [
    logEffect,
    storageEffect,
  ],
})

export const officialFilterAtom = atom<string>({
  key: 'officialFilter',
  default: '',
})

export const filteredOfficialsQuery = selector({
  key: 'filteredOfficials',
  get: ({ get }) => {
    const filter = get(officialFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(officialsAtom)

    if (!filter) {
      return list
    }
    return list.filter(official =>
      [official.id, official.email, official.name, official.district, official.location, official.phone]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter))
  },
})

export const useOfficialsActions = () => {
  const setOfficials = useSetRecoilState(officialsAtom)

  return {
    refresh,
  }

  function refresh() {
    getOfficials(true)
      .then(officials => {
        const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
        setOfficials(sortedOfficials)
      })
  }
}
