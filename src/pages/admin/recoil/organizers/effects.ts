import type { AtomEffect } from 'recoil'
import type { Organizer } from '../../../../types'

import i18next from 'i18next'

import { getAdminOrganizers } from '../../../../api/organizer'
import { idTokenAtom } from '../../../recoil'

let loaded = false

export const remoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, getPromise, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      if (!token) return
      loaded = true
      getAdminOrganizers(token)
        .then((organizers) => {
          const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
          setSelf(sortedOrganizers)
        })
        .catch((reason) => {
          console.error(reason)
          setSelf([])
        })
    })
  }
}
