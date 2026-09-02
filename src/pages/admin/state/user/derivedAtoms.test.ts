import type { User } from '../../../../types'
import { createStore } from 'jotai'
import { adminUserIdAtom, adminUsersAtom } from './atoms'
import { adminCurrentUserAtom } from './derivedAtoms'

describe('adminCurrentUserAtom', () => {
  it('serves the selected user synchronously once the users have loaded', async () => {
    const selected: User = { email: 'selected@example.com', id: 'selected', name: 'Selected' }
    const other: User = { email: 'other@example.com', id: 'other', name: 'Other' }

    const store = createStore()
    await store.set(adminUsersAtom, [other, selected])
    store.set(adminUserIdAtom, 'selected')

    // A Promise here would suspend the users page on every row selection.
    expect(store.get(adminCurrentUserAtom)).toBe(selected)
  })
})
