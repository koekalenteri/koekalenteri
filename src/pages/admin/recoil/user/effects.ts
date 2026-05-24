import type { AtomEffect } from 'recoil'
import type { User } from '../../../../types'
import { getUsers } from '../../../../api/user'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

export const adminRemoteUsersEffect: AtomEffect<User[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'users',
  fetch: (token) => getUsers(token),
})
