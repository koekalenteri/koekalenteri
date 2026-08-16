import type { User } from '../../../../types'
import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'
import { userHasAdminAccess } from '../../../../lib/user'
import { adminUserOrgIdsSelector, isAdminSelector, userSelector } from '../../../recoil'
import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom, adminUsersOrganizerIdAtom } from './atoms'

export const adminFilteredUsersSelector = selector({
  get: ({ get }) => {
    const isAdmin = get(isAdminSelector)
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const users = get(adminUsersAtom)
    const orgIds = get(adminUserOrgIdsSelector)
    const orgId = get(adminUsersOrganizerIdAtom)

    let result = isAdmin
      ? users
      : users.filter((u) => u.roles && Object.keys(u.roles).some((id) => orgIds.includes(id)))

    if (orgId) {
      result = result.filter((u) => u.roles?.[orgId])
    }

    if (filter) {
      result = result.filter((user) =>
        [user.id, user.email, user.name, user.location, user.phone]
          .join(' ')
          .toLocaleLowerCase(i18next.language)
          .includes(filter)
      )
    }

    return result
  },
  key: 'adminFilteredUsers',
})

export const canReadWebsocketAdminUsers = (
  user?: { id?: string; admin?: boolean; roles?: Record<string, unknown> } | null
) => Boolean(user?.id && userHasAdminAccess(user))

export const websocketAdminUsersSelector = selector({
  get: ({ get }) => {
    const currentUser = get(userSelector)
    if (!canReadWebsocketAdminUsers(currentUser)) {
      return []
    }

    return get(adminUsersAtom)
  },
  key: 'websocketAdminUsers',
})

const adminUserSelector = selectorFamily<User | undefined, string | undefined>({
  get:
    (userId) =>
    ({ get }) => {
      const events = get(adminUsersAtom)
      return events.find((e) => e.id === userId)
    },
  key: 'adminUserSelector',
})

export const adminCurrentUserSelector = selector({
  get: ({ get }) => {
    const userId = get(adminUserIdAtom)
    return userId ? get(adminUserSelector(userId)) : undefined
  },
  key: 'adminCurrentAdminUser',
})
