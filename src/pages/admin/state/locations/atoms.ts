import { atom } from 'jotai'
import { adminLocationsRemoteAtom } from './remoteAtoms'

export const adminLocationsAtom = adminLocationsRemoteAtom

/**
 * Municipality names for the event form's location field. The event form loads its options with a
 * Promise.all, so a failed fetch must not take the whole form down: the field is free text with or
 * without the suggestions.
 */
export const adminLocationNamesAtom = atom(async (get) => {
  try {
    return (await get(adminLocationsAtom)).map((location) => location.name)
  } catch (error) {
    console.error(error)
    return []
  }
})
