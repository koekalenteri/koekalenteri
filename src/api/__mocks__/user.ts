import type { User } from '../../types'

const MOCK_ADMIN: User = {
  admin: true,
  email: 'test@user.jest',
  id: 'asdf1234',
  name: 'Test User',
}

export const getUser = async (_token: string, _signal?: AbortSignal) => MOCK_ADMIN

export const getUsers = async (_token: string, _signal?: AbortSignal) => [MOCK_ADMIN]
