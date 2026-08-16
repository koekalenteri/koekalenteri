import { selector } from 'recoil'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminOfficialFilterAtom, adminOfficialsAtom } from './atoms'

export const adminFilteredOfficialsSelector = selector({
  get: ({ get }) => {
    return filterOfficialDirectory(get(adminOfficialsAtom), get(adminOfficialFilterAtom))
  },
  key: 'adminFilteredOfficials',
})
