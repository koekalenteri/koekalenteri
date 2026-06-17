import type { AtomEffect } from 'recoil'
import type { Official } from '../../../../types'
import i18next from 'i18next'
import { getOfficials } from '../../../../api/official'
import { createCachedRemoteCollectionEffect } from '../cached/createCachedRemoteCollection'

export const adminRemoteOfficialsEffect: AtomEffect<Official[]> = createCachedRemoteCollectionEffect({
  cacheKey: 'officials',
  fetch: (token) => getOfficials(token),
  sort: (officials) => {
    officials.sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    return officials
  },
})
