import type { AtomEffect } from 'recoil'
import type { Official } from '../../../../types'

import i18next from 'i18next'

import { getOfficials } from '../../../../api/official'
import { idTokenAtom } from '../../../recoil'

let loaded = false

export const remoteOfficialsEffect: AtomEffect<Official[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      loaded = true

      getOfficials(token)
        .then((officials) => {
          const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
          setSelf(sortedOfficials)
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
