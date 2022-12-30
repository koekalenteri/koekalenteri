
import i18next from 'i18next'
import { Organizer } from 'koekalenteri-shared/model'
import { atom, selector, useSetRecoilState } from 'recoil'

import { getOrganizers } from '../../api/organizer'

import { logEffect, storageEffect } from './effects'

export const organizersAtom = atom<Organizer[]>({
  key: 'organizers',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    ({setSelf, trigger}) => {
      if (trigger === 'get') {
        getOrganizers().then(organizers => {
          const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
          setSelf(sortedOrganizers)
        })
      }
    },
  ],
})

export const organizerFilterAtom = atom<string>({
  key: 'organizerFilter',
  default: '',
})

export const filteredOrganizersQuery = selector({
  key: 'filteredOrganizers',
  get: ({ get }) => {
    const filter = get(organizerFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(organizersAtom)

    return filter ? list.filter(o => o.name.toLocaleLowerCase(i18next.language).includes(filter)) : list
  },
})

export const useOrganizersActions = () => {
  const setOrganizers = useSetRecoilState(organizersAtom)

  return {
    refresh,
  }

  function refresh() {
    getOrganizers(true)
      .then(organizers => {
        const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
        setOrganizers(sortedOrganizers)
      })
  }
}
