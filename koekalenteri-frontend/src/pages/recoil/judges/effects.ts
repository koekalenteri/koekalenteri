import i18next from 'i18next'
import { Judge } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getJudges } from '../../../api/judge'

export const remoteJudgesEffect: AtomEffect<Judge[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getJudges().then((judges) => {
      const sortedJudges = [...judges].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setSelf(sortedJudges)
    })
  }
}
