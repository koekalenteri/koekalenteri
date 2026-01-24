import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { User } from '../../../../types'
import { atom } from 'recoil'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil/effects'
import { adminRemoteUsersEffect } from './effects'

export const adminUsersAtom = atom<User[]>({
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteUsersEffect],
  key: 'adminUsers',
})

export const adminUserFilterAtom = atom<string>({
  default: '',
  key: 'adminUserFilter',
})

export const adminUserIdAtom = atom<string | undefined>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminUserId',
})

export const adminUsersColumnsAtom = atom<GridColumnVisibilityModel>({
  default: {
    district: false,
    eventTypes: true,
    location: false,
    name: true,
    roles: true,
  },
  effects: [logEffect, localStorageEffect],
  key: 'adminUsersColumns',
})
