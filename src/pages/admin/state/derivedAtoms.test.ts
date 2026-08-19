import type { Organizer, User } from '../../../types'
import { createStore } from 'jotai'
import { adminFilteredOrganizersAtom, adminUsersOrganizersAtom } from './derivedAtoms'
import { adminOrganizerFilterAtom, adminOrganizersAtom, adminShowOnlyOrganizersWithUsersAtom } from './organizers/atoms'
import { adminUsersAtom } from './user/atoms'

const organizers: Organizer[] = [
  { id: 'org-1', name: 'Alpha Club' },
  { id: 'org-2', name: 'Beta Club' },
]

const users: User[] = [
  { email: 'one@example.com', id: 'user-1', name: 'User One', roles: { missing: 'secretary', 'org-1': 'admin' } },
]

describe('admin cross-domain atoms', () => {
  it('lists organizers referenced by users and represents missing organizers', async () => {
    const store = createStore()
    store.set(adminOrganizersAtom, organizers)
    store.set(adminUsersAtom, users)

    await expect(store.get(adminUsersOrganizersAtom)).resolves.toEqual([
      organizers[0],
      { id: 'missing', name: '(tuntematon/poistettu yhdistys: missing)' },
    ])
  })

  it('filters organizers by user roles and search text', async () => {
    const store = createStore()
    store.set(adminOrganizerFilterAtom, 'alpha')
    store.set(adminOrganizersAtom, organizers)
    store.set(adminShowOnlyOrganizersWithUsersAtom, true)
    store.set(adminUsersAtom, users)

    await expect(store.get(adminFilteredOrganizersAtom)).resolves.toEqual([organizers[0]])
  })
})
