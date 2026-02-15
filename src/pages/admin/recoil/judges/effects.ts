import type { AtomEffect } from 'recoil'
import type { Judge } from '../../../../types'

import i18next from 'i18next'
import { DefaultValue } from 'recoil'

import { getJudges } from '../../../../api/judge'
import { accessTokenAtom } from '../../../recoil/user'

export const adminRemoteJudgesEffect: AtomEffect<Judge[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(accessTokenAtom).then((token) =>
        token
          ? getJudges(token).then((judges) =>
              [...judges].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
            )
          : new DefaultValue()
      )
    )
  }
}
