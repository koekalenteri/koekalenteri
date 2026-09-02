import type { Organizer } from '../../../../types'
import { createStore } from 'jotai'
import { adminOrganizerIdAtom, adminOrganizersAtom } from './atoms'
import { adminCurrentOrganizerAtom } from './derivedAtoms'

describe('adminCurrentOrganizerAtom', () => {
  it('serves the selected organizer synchronously once the organizers have loaded', async () => {
    const selected: Organizer = { id: 'selected', name: 'Selected' }
    const other: Organizer = { id: 'other', name: 'Other' }

    const store = createStore()
    await store.set(adminOrganizersAtom, [other, selected])
    store.set(adminOrganizerIdAtom, 'selected')

    // A Promise here would suspend the organizers page on every row selection.
    expect(store.get(adminCurrentOrganizerAtom)).toBe(selected)
  })
})
