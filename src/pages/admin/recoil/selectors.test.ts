import type { Organizer, User } from '../../../types'
import { snapshot_UNSTABLE } from 'recoil'
import { adminOrganizerFilterAtom, adminOrganizersAtom, adminShowOnlyOrganizersWithUsersAtom } from './organizers/atoms'
import { adminFilteredOrganizersSelector, adminUsersOrganizersSelector } from './selectors'
import { adminUsersAtom } from './user/atoms'

const organizers: Organizer[] = [
  { id: 'org-1', name: 'Alpha Club' },
  { id: 'org-2', name: 'Beta Club' },
]

const users: User[] = [
  { email: 'one@example.com', id: 'user-1', name: 'User One', roles: { missing: 'secretary', 'org-1': 'admin' } },
]

describe('admin cross-domain selectors', () => {
  it('lists organizers referenced by users and represents missing organizers', () => {
    const snapshot = snapshot_UNSTABLE(({ set }) => {
      set(adminOrganizersAtom, organizers)
      set(adminUsersAtom, users)
    })

    expect(snapshot.getLoadable(adminUsersOrganizersSelector).valueOrThrow()).toEqual([
      organizers[0],
      { id: 'missing', name: '(tuntematon/poistettu yhdistys: missing)' },
    ])
  })

  it('filters organizers by user roles and search text', () => {
    const snapshot = snapshot_UNSTABLE(({ set }) => {
      set(adminOrganizerFilterAtom, 'alpha')
      set(adminOrganizersAtom, organizers)
      set(adminShowOnlyOrganizersWithUsersAtom, true)
      set(adminUsersAtom, users)
    })

    expect(snapshot.getLoadable(adminFilteredOrganizersSelector).valueOrThrow()).toEqual([organizers[0]])
  })
})
