import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'

export { adminUsersRemoteAtom as adminUsersAtom } from './remoteAtoms'
/**
 * When the list was last refreshed for `lastSeen`, so opening the page again does not ask for it
 * over and over. Deliberately not persisted: a reload stays the way to force a refresh.
 */
export const adminUsersRefreshedAtAtom = atom(0)
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
