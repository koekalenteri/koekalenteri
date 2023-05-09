import i18next from 'i18next'
import { User } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { userAtom } from '../../../recoil'
import { organizersAtom } from '../organizers'

import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom } from './atoms'

export const filteredUsersSelector = selector({
  key: 'filteredUsers',
  get: ({ get }) => {
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminUsersAtom)

    if (!filter) {
      return list
    }
    return list.filter((user) =>
      [user.id, user.email, user.name, user.location, user.phone]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
  },
})

export const adminUserSelector = selectorFamily<User | undefined, string | undefined>({
  key: 'adminUserSelector',
  get:
    (userId) =>
    ({ get }) => {
      const events = get(adminUsersAtom)
      return events.find((e) => e.id === userId)
    },
})

export const currentAdminUserSelector = selector({
  key: 'currentAdminUser',
  get: ({ get }) => {
    const userId = get(adminUserIdAtom)
    return userId ? get(adminUserSelector(userId)) : undefined
  },
})

export const adminUserOrganizersSelector = selector({
  key: 'adminUserOrganizers',
  get: ({ get }) => {
    const user = get(userAtom)
    const list = get(organizersAtom)

    return user?.admin ? list : list.filter((o) => user?.roles?.[o.id])
  },
})
