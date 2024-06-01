import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { User } from '../../../../types'

import { atom } from 'recoil'

import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteUsersEffect } from './effects'

export const adminUsersAtom = atom<User[]>({
  key: 'adminUsers',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteUsersEffect],
})

export const adminUserFilterAtom = atom<string>({
  key: 'adminUserFilter',
  default: '',
})

export const adminUserIdAtom = atom<string | undefined>({
  key: 'adminUserId',
  default: '',
  effects: [logEffect, localStorageEffect],
})

export const adminUsersColumnsAtom = atom<GridColumnVisibilityModel>({
  key: 'adminUsersColumns',
  default: {
    district: false,
    eventTypes: true,
    location: false,
    name: true,
    roles: true,
  },
  effects: [logEffect, localStorageEffect],
})
