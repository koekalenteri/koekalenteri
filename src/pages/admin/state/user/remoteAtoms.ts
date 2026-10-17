import type { JsonUser, User } from '@/types'
import { getUsers } from '@/api/user'
import { toUser } from '@/lib/wire'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminUsersRemoteAtom = atomWithCachedRemoteCollection<User, JsonUser>({
  cacheKey: 'users',
  fetch: (token) => getUsers(token),
  revive: toUser,
})
