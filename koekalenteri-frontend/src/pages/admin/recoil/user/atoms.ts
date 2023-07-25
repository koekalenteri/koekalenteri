import type { User } from 'koekalenteri-shared/model'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteUsersEffect } from './effects'

export const adminUsersAtom = atom<User[]>({
  key: 'adminUsers',
  default: [],
  effects: [logEffect, storageEffect, remoteUsersEffect],
})

export const adminUserFilterAtom = atom<string>({
  key: 'adminUserFilter',
  default: '',
})

export const adminUserIdAtom = atom<string | undefined>({
  key: 'adminUserId',
  default: '',
  effects: [logEffect, storageEffect],
})
