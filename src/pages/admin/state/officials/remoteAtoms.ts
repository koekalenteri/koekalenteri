import type { Official } from '../../../../types'
import { getOfficials } from '../../../../api/official'
import { atomWithOfficialDirectory } from '../officialDirectory'

export const adminOfficialsRemoteAtom = atomWithOfficialDirectory<Official>({
  cacheKey: 'officials',
  fetch: (token) => getOfficials(token),
})
