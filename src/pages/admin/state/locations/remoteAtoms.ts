import type { Location } from '@/types'
import { getLocations } from '@/api/location'
import { compareByLocalizedString } from '@/lib/client/sort'
import { atomWithCachedRemoteCollection } from '../cached/createCachedRemoteCollection'

export const adminLocationsRemoteAtom = atomWithCachedRemoteCollection<Location>({
  cacheKey: 'locations',
  fetch: (token) => getLocations(token),
  // A location holds no Date: its JSON is its model.
  revive: (location) => location,
  sort: (locations) => {
    locations.sort(compareByLocalizedString('name'))
    return locations
  },
})
