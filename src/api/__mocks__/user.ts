import type { User } from '../../types'

const MOCK_ADMIN: User = {
  admin: true,
  email: 'test@user.vi',
  id: 'asdf1234',
  name: 'Test User',
}

/** A signed-in user with no admin flag and no organizer role: no access to the admin pages. */
export const MOCK_NO_ROLE_USER: User = {
  email: 'norole@user.vi',
  id: 'norole1234',
  name: 'No Role',
  roles: {},
}

export const getUser = vi.fn(async (_token: string, _signal?: AbortSignal): Promise<User> => MOCK_ADMIN)

const MOCK_RETURNING_USER: User = {
  email: 'returning@user.vi',
  id: 'qwer5678',
  lastSeen: new Date('2026-09-20T10:00:00Z'),
  name: 'Returning User',
}

export const getUsers = async (_token: string, _signal?: AbortSignal) => [MOCK_ADMIN, MOCK_RETURNING_USER]
