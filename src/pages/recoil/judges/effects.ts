import type { AtomEffect } from 'recoil'
import type { Judge } from '../../../types'

import i18next from 'i18next'

import { getJudges } from '../../../api/judge'
import { idTokenAtom } from '../user'

let loaded = false

export const remoteJudgesEffect: AtomEffect<Judge[]> = ({ getPromise, setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      if (!token) return
      loaded = true
      getJudges(token)
        .then((judges) => {
          judges.sort((a, b) => a.name.localeCompare(b.name, i18next.language))
          setSelf(judges)
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
