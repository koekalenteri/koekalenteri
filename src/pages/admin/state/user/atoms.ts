import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'
import { adminUsersRemoteAtom } from './remoteAtoms'

export const adminUsersAtom = adminUsersRemoteAtom
export const adminUserFilterAtom = atom('')
export const adminUserIdAtom = atomWithLocalStorage<string | undefined>('adminUserId', '')
export const adminUsersOrganizerIdAtom = atomWithLocalStorage('adminUsersOrganizerId', '')
export const adminUsersColumnsAtom = atomWithLocalStorage<GridColumnVisibilityModel>('adminUsersColumns', {
  district: false,
  eventTypes: true,
  location: false,
  name: true,
  roles: true,
})
