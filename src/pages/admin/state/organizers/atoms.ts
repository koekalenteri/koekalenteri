import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'
import { adminOrganizersRemoteAtom } from './remoteAtoms'

export const adminOrganizersAtom = adminOrganizersRemoteAtom
export const adminOrganizerFilterAtom = atom('')
export const adminOrganizerIdAtom = atomWithLocalStorage<string | undefined>('adminOrganizerId', '')
export const adminOrganizerColumnsAtom = atomWithLocalStorage<GridColumnVisibilityModel>('adminOrganizerColumns', {
  id: false,
})
export const adminShowOnlyOrganizersWithUsersAtom = atomWithLocalStorage('adminShowOnlyOrganizersWithUsers', true)
