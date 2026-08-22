import type { User } from '../../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { userHasAdminAccess } from '../../../../lib/user'
import { adminUserOrgIdsAtom, isAdminAtom, userAtom } from '../../../state'
import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom, adminUsersOrganizerIdAtom } from './atoms'

export const adminFilteredUsersAtom = atom(async (get) => {
  const isAdmin = await get(isAdminAtom)
  const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
  const users = await get(adminUsersAtom)
  const orgIds = await get(adminUserOrgIdsAtom)
  const orgId = get(adminUsersOrganizerIdAtom)

  let result = isAdmin ? users : users.filter((u) => u.roles && Object.keys(u.roles).some((id) => orgIds.includes(id)))

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
})

export const canReadWebsocketAdminUsers = (
  user?: { id?: string; admin?: boolean; roles?: Record<string, unknown> } | null
) => Boolean(user?.id && userHasAdminAccess(user))

export const websocketAdminUsersAtom = atom((get) => {
  const currentUser = get(userAtom)
  const selectUsers = (user: Awaited<typeof currentUser>) =>
    canReadWebsocketAdminUsers(user) ? get(adminUsersAtom) : []
  return currentUser instanceof Promise ? currentUser.then(selectUsers) : selectUsers(currentUser)
})

const adminUserAtom = atomFamily((userId: string | undefined) =>
  atom(async (get): Promise<User | undefined> => {
    const events = await get(adminUsersAtom)
    return events.find((e) => e.id === userId)
  })
)

export const adminCurrentUserAtom = atom(async (get) => {
  const userId = get(adminUserIdAtom)
  return userId ? await get(adminUserAtom(userId)) : undefined
})
