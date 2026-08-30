import type { Location } from '../../../../types'
import { getLocations } from '../../../../api/location'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminLocationsRemoteAtom = atomWithCachedRemoteCollection<Location>({
  cacheKey: 'locations',
  fetch: (token) => getLocations(token),
  sort: (locations) => {
    locations.sort(compareByLocalizedString('name'))
    return locations
  },
})
