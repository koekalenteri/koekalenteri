import { atom } from 'jotai'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminOfficialFilterAtom, adminOfficialsAtom } from './atoms'

export const adminFilteredOfficialsAtom = atom(async (get) => {
  return filterOfficialDirectory(await get(adminOfficialsAtom), get(adminOfficialFilterAtom))
})
