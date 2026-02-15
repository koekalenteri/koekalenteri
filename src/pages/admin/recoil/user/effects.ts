import type { AtomEffect } from 'recoil'
import type { User } from '../../../../types'
import { DefaultValue } from 'recoil'
import { getUsers } from '../../../../api/user'
import { idTokenAtom } from '../../../recoil'

export const adminRemoteUsersEffect: AtomEffect<User[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(idTokenAtom).then((token) => (token ? getUsers(token).then((users) => users) : new DefaultValue()))
    )
  }
}
