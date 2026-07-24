import type { AtomEffect } from 'recoil'
import type { Organizer } from '../../../../types'
import i18next from 'i18next'
import { DefaultValue } from 'recoil'
import { getAdminOrganizers } from '../../../../api/organizer'
import { validIdTokenSelector } from '../../../recoil'

export const adminRemoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, getPromise, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(validIdTokenSelector).then((token) =>
        token
          ? getAdminOrganizers(token).then((organizers) =>
              [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
            )
          : new DefaultValue()
      )
    )
  }
}
