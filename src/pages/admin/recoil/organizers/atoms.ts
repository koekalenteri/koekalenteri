import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { Organizer } from '../../../../types'

import { atom } from 'recoil'

import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteOrganizersEffect } from './effects'

export const adminOrganizersAtom = atom<Organizer[]>({
  key: 'adminOrganizers',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteOrganizersEffect],
})

export const adminOrganizerFilterAtom = atom<string>({
  key: 'adminOrganizerFilter',
  default: '',
})

export const adminOrganizerIdAtom = atom<string | undefined>({
  key: 'adminOrganizerId',
  default: '',
  effects: [logEffect, localStorageEffect],
})

export const adminOrganizerColumnsAtom = atom<GridColumnVisibilityModel>({
  key: 'adminOrganizerColumns',
  default: { id: false },
  effects: [logEffect, localStorageEffect],
})

export const adminEventOrganizerIdAtom = atom<string>({
  key: 'adminEventOrganizerId',
  default: '',
  effects: [logEffect, localStorageEffect],
})

export const adminUsersOrganizerIdAtom = atom<string>({
  key: 'adminUsersOrganizerId',
  default: '',
  effects: [logEffect, localStorageEffect],
})

export const adminShowOnlyOrganizersWithUsersAtom = atom<boolean>({
  key: 'adminShowOnlyOrganizersWithUsers',
  default: true,
  effects: [logEffect, localStorageEffect],
})
