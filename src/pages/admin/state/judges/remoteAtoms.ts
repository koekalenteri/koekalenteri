import type { Judge } from '../../../../types'
import { getJudges } from '../../../../api/judge'
import { atomWithOfficialDirectory } from '../officialDirectory'

export const adminJudgesRemoteAtom = atomWithOfficialDirectory<Judge>({
  cacheKey: 'judges',
  fetch: (token) => getJudges(token),
})
