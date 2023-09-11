import type { Organizer } from 'koekalenteri-shared/model'
import type { AtomEffect } from 'recoil'

import i18next from 'i18next'

import { getAdminOrganizers } from '../../../../api/organizer'

let loaded = false

export const remoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get' && !loaded) {
    loaded = true
    getAdminOrganizers()
      .then((organizers) => {
        const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
        setSelf(sortedOrganizers)
      })
      .catch((reason) => {
        console.error(reason)
        setSelf([])
      })
  }
}
