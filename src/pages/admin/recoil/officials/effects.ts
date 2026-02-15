import type { AtomEffect } from 'recoil'
import type { Official } from '../../../../types'

import i18next from 'i18next'
import { DefaultValue } from 'recoil'

import { getOfficials } from '../../../../api/official'
import { accessTokenAtom } from '../../../recoil'

export const adminRemoteOfficialsEffect: AtomEffect<Official[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(accessTokenAtom).then((token) =>
        token
          ? getOfficials(token).then((officials) => {
              officials.sort((a, b) => a.name.localeCompare(b.name, i18next.language))

              return officials
            })
          : new DefaultValue()
      )
    )
  }
}
