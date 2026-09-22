import type { User } from '../../types'

const MOCK_ADMIN: User = {
  admin: true,
  email: 'test@user.vi',
  id: 'asdf1234',
  name: 'Test User',
}

export const getUser = async (_token: string, _signal?: AbortSignal) => MOCK_ADMIN

const MOCK_RETURNING_USER: User = {
  email: 'returning@user.vi',
  id: 'qwer5678',
  lastSeen: new Date('2026-09-20T10:00:00Z'),
  name: 'Returning User',
}

export const getUsers = async (_token: string, _signal?: AbortSignal) => [MOCK_ADMIN, MOCK_RETURNING_USER]
