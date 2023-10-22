import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { Organizer } from '../../../../types'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteOrganizersEffect } from './effects'

export const adminOrganizersAtom = atom<Organizer[]>({
  key: 'adminOrganizers',
  default: [],
  effects: [logEffect, storageEffect, remoteOrganizersEffect],
})

export const adminOrganizerFilterAtom = atom<string>({
  key: 'adminOrganizerFilter',
  default: '',
})

export const adminOrganizerIdAtom = atom<string | undefined>({
  key: 'adminOrganizerId',
  default: '',
  effects: [logEffect, storageEffect],
})

export const adminOrganizerColumnsAtom = atom<GridColumnVisibilityModel>({
  key: 'adminOrganizerColumns',
  default: { id: false },
  effects: [logEffect, storageEffect],
})

export const adminEventOrganizerIdAtom = atom<string>({
  key: 'adminEventOrganizerId',
  default: '',
  effects: [logEffect, storageEffect],
})
