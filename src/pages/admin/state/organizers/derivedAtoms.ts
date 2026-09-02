import { atom } from 'jotai'
import { findInCollection } from '../cached/createCachedRemoteCollection'
import { adminOrganizerIdAtom, adminOrganizersAtom } from './atoms'

// Not an `async` getter: that returns a new Promise on every call, and each change of
// adminOrganizerIdAtom would then suspend the organizers page and swap it for its Suspense fallback.
export const adminCurrentOrganizerAtom = atom((get) => {
  const organizerId = get(adminOrganizerIdAtom)
  return organizerId ? findInCollection(get(adminOrganizersAtom), organizerId) : undefined
})
