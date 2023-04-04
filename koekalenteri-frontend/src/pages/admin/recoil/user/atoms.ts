import { User } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteUsersEffect } from './effects'

export const usersAtom = atom<User[]>({
  key: 'users',
  default: [],
  effects: [logEffect, storageEffect, remoteUsersEffect],
})

export const userFilterAtom = atom<string>({
  key: 'userFilter',
  default: '',
})
