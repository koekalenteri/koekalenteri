import type { Organizer } from '../../../../types'
import { getAdminOrganizers } from '../../../../api/organizer'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminOrganizersRemoteAtom = atomWithCachedRemoteCollection<Organizer>({
  cacheKey: 'organizers',
  fetch: (token) => getAdminOrganizers(token),
  sort: (organizers) => {
    organizers.sort(compareByLocalizedString('name'))
    return organizers
  },
})
