import type { AtomEffect } from 'recoil'
import type { Organizer } from '../../../../types'
import { DefaultValue } from 'recoil'
import { getAdminOrganizers } from '../../../../api/organizer'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { validIdTokenSelector } from '../../../recoil'

export const adminRemoteOrganizersEffect: AtomEffect<Organizer[]> = ({ setSelf, getPromise, trigger }) => {
  if (trigger === 'get') {
    setSelf(
      getPromise(validIdTokenSelector).then((token) =>
        token
          ? getAdminOrganizers(token).then((organizers) => [...organizers].sort(compareByLocalizedString('name')))
          : new DefaultValue()
      )
    )
  }
}
