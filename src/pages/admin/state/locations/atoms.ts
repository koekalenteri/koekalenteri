import { atom } from 'jotai'
import { mapMaybe } from '@/lib/maybePromise'
import { adminLocationsRemoteAtom } from './remoteAtoms'

export const adminLocationsAtom = adminLocationsRemoteAtom

const noNames = (error: unknown): string[] => {
  console.error(error)
  return []
}

/**
 * Municipality names for the event form's location field. The event form loads its options with a
 * Promise.all, so a failed fetch must not take the whole form down: the field is free text with or
 * without the suggestions. A settled collection that failed throws from the read itself, a pending
 * one rejects; both end in the empty list.
 *
 * Not an `async` getter: that returns a new Promise on every call, and a list that changed under
 * the form would then suspend it and swap it for its Suspense fallback.
 */
export const adminLocationNamesAtom = atom((get) => {
  try {
    const names = mapMaybe(get(adminLocationsAtom), (locations) => locations.map((location) => location.name))
    return names instanceof Promise ? names.catch(noNames) : names
  } catch (error) {
    return noNames(error)
  }
})
