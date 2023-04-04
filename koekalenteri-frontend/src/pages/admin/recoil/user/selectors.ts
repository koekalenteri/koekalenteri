import i18next from 'i18next'
import { selector } from 'recoil'

import { userFilterAtom, usersAtom } from './atoms'

export const filteredUsersSelector = selector({
  key: 'filteredUsers',
  get: ({ get }) => {
    const filter = get(userFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(usersAtom)

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
