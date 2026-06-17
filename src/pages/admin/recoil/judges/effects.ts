import type { AtomEffect } from 'recoil'
import type { Judge } from '../../../../types'
import i18next from 'i18next'
import { getJudges } from '../../../../api/judge'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

export const adminRemoteJudgesEffect: AtomEffect<Judge[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'judges',
  fetch: (token) => getJudges(token),
  sort: (judges) => {
    judges.sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    return judges
  },
})
