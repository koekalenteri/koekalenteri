import i18next from 'i18next'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { userHasAdminAccess } from '../../../../lib/user'
import { adminUserOrgIdsAtom, isAdminAtom, userAtom } from '../../../state'
import { findInCollection } from '../cached/createCachedRemoteCollection'
import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom, adminUsersOrganizerIdAtom } from './atoms'

// unwrap keeps serving the previous list synchronously while a new filter/data promise settles,
// instead of re-suspending (and remounting the page) on every filter keystroke.
export const adminFilteredUsersAtom = unwrap(
  atom(async (get) => {
    const isAdmin = await get(isAdminAtom)
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const users = await get(adminUsersAtom)
    const orgIds = await get(adminUserOrgIdsAtom)
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
  }),
  (prev) => prev ?? []
)

export const canReadWebsocketAdminUsers = (
  user?: { id?: string; admin?: boolean; roles?: Record<string, unknown> } | null
) => Boolean(user?.id && userHasAdminAccess(user))

export const websocketAdminUsersAtom = atom((get) => {
  const currentUser = get(userAtom)
  const selectUsers = (user: Awaited<typeof currentUser>) =>
    canReadWebsocketAdminUsers(user) ? get(adminUsersAtom) : []
  return currentUser instanceof Promise ? currentUser.then(selectUsers) : selectUsers(currentUser)
})

// Not an `async` getter: that returns a new Promise on every call, and each change of
// adminUserIdAtom would then suspend the users page and swap it for its Suspense fallback.
export const adminCurrentUserAtom = atom((get) => {
  const userId = get(adminUserIdAtom)
  return userId ? findInCollection(get(adminUsersAtom), userId) : undefined
})
