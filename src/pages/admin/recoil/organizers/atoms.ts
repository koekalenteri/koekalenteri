import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { Organizer } from '../../../../types'
import { atom } from 'recoil'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil/effects'
import { adminRemoteOrganizersEffect } from './effects'

export const adminOrganizersAtom = atom<Organizer[]>({
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteOrganizersEffect],
  key: 'adminOrganizers',
})

export const adminOrganizerFilterAtom = atom<string>({
  default: '',
  key: 'adminOrganizerFilter',
})

export const adminOrganizerIdAtom = atom<string | undefined>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminOrganizerId',
})

export const adminOrganizerColumnsAtom = atom<GridColumnVisibilityModel>({
  default: { id: false },
  effects: [logEffect, localStorageEffect],
  key: 'adminOrganizerColumns',
})

export const adminEventOrganizerIdAtom = atom<string>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminEventOrganizerId',
})

export const adminUsersOrganizerIdAtom = atom<string>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminUsersOrganizerId',
})

export const adminShowOnlyOrganizersWithUsersAtom = atom<boolean>({
  default: true,
  effects: [logEffect, localStorageEffect],
  key: 'adminShowOnlyOrganizersWithUsers',
})
