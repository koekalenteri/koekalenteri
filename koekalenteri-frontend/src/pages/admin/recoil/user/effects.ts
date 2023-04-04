import { User } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getUsers } from '../../../../api/user'
import { idTokenSelector } from '../../../recoil'

let loaded = false

export const remoteUsersEffect: AtomEffect<User[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenSelector).then((token) => {
      if (!token) {
        setSelf([])
      } else {
        getUsers(token)
          .then((users) => {
            loaded = true
            setSelf(users)
          })
          .catch((err) => {
            loaded = true
            console.error(err)
            setSelf([])
          })
      }
    })
  }
}
