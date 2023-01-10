import i18next from 'i18next'
import { Organizer } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getOrganizers } from '../../../../api/organizer'

export const remoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getOrganizers().then(organizers => {
      const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setSelf(sortedOrganizers)
    })
  }
}
