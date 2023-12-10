import type { Organizer } from '../../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { unique } from '../../../../lib/utils'
import { adminUsersAtom } from '../user'

import {
  adminOrganizerFilterAtom,
  adminOrganizerIdAtom,
  adminOrganizersAtom,
  adminShowOnlyOrganizersWithUsersAtom,
} from './atoms'

export const filteredOrganizersSelector = selector({
  key: 'filteredOrganizers',
  get: ({ get }) => {
    const filter = get(adminOrganizerFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminOrganizersAtom)
    const withUsers = get(adminShowOnlyOrganizersWithUsersAtom)
    const users = withUsers ? get(adminUsersAtom) : []
    const ids = unique(users.flatMap((u) => Object.keys(u.roles ?? {}))).filter(Boolean)
    const result = ids.length ? list.filter((o) => ids.includes(o.id)) : list

    return filter ? result.filter((o) => o.name.toLocaleLowerCase(i18next.language).includes(filter)) : result
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
