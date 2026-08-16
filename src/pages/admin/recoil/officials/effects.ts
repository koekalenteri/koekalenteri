import type { Official } from '../../../../types'
import { getOfficials } from '../../../../api/official'
import { createOfficialDirectoryEffect } from '../officialDirectory'

export const adminRemoteOfficialsEffect = createOfficialDirectoryEffect<Official>({
  cacheKey: 'officials',
  fetch: (token) => getOfficials(token),
})
