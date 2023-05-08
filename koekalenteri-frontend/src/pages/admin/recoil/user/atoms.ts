import { User } from 'koekalenteri-shared/model'
import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteUsersEffect } from './effects'

export const adminUsersAtom = atom<User[]>({
  key: 'users',
  default: [],
  effects: [logEffect, storageEffect, remoteUsersEffect],
})

export const adminUserFilterAtom = atom<string>({
  key: 'userFilter',
  default: '',
})

export const adminUserIdAtom = atom<string | undefined>({
  key: 'userId',
  default: '',
  effects: [logEffect, storageEffect],
})
