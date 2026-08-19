import type { User } from '../../../../types'
import { getUsers } from '../../../../api/user'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminUsersRemoteAtom = atomWithCachedRemoteCollection<User>({
  cacheKey: 'users',
  fetch: (token) => getUsers(token),
})
