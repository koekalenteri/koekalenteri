import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import { atom } from 'jotai'
import { atomWithLocalStorage } from '../../../state/storage'

export { adminOrganizersRemoteAtom as adminOrganizersAtom } from './remoteAtoms'
export const adminOrganizerFilterAtom = atom('')
export const adminOrganizerIdAtom = atomWithLocalStorage<string | undefined>('adminOrganizerId', '')
export const adminOrganizerColumnsAtom = atomWithLocalStorage<GridColumnVisibilityModel>('adminOrganizerColumns', {
  id: false,
})
export const adminShowOnlyOrganizersWithUsersAtom = atomWithLocalStorage('adminShowOnlyOrganizersWithUsers', true)
