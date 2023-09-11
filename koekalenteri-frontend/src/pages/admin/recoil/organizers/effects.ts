import type { Organizer } from 'koekalenteri-shared/model'
import type { AtomEffect } from 'recoil'

import i18next from 'i18next'

import { getAdminOrganizers } from '../../../../api/organizer'
import { idTokenAtom } from '../../../recoil'

let loaded = false

export const remoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, getPromise, trigger }) => {
  if (trigger === 'get' && !loaded) {
    getPromise(idTokenAtom).then((token) => {
      loaded = true
      getAdminOrganizers(false, token)
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
