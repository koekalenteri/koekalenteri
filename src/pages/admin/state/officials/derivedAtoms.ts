import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { filterOfficialDirectory } from '../officialDirectory'
import { adminOfficialFilterAtom, adminOfficialsAtom } from './atoms'

// unwrap keeps serving the previous list synchronously while a new filter/data promise settles,
// instead of re-suspending (and remounting the page) on every filter keystroke.
export const adminFilteredOfficialsAtom = unwrap(
  atom(async (get) => filterOfficialDirectory(await get(adminOfficialsAtom), get(adminOfficialFilterAtom))),
  (prev) => prev ?? []
)
