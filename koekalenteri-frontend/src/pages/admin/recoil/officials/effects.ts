import i18next from 'i18next'
import { Official } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getOfficials } from '../../../../api/official'

let loaded = false

export const remoteOfficialsEffect: AtomEffect<Official[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    loaded = true
    getOfficials()
      .then((officials) => {
        const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
        setSelf(sortedOfficials)
      })
      .catch((reason) => {
        throw new Error(reason)
      })
  }
}
