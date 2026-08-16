import type { Judge } from '../../../../types'
import { getJudges } from '../../../../api/judge'
import { createOfficialDirectoryEffect } from '../officialDirectory'

export const adminRemoteJudgesEffect = createOfficialDirectoryEffect<Judge>({
  cacheKey: 'judges',
  fetch: (token) => getJudges(token),
})
