import type { User } from '../../types'

const MOCK_ADMIN: User = {
  id: 'asdf1234',
  name: 'Test User',
  email: 'test@user.jest',
  admin: true,
}

export const getUser = async (_token: string, _signal?: AbortSignal) => MOCK_ADMIN

export const getUsers = async (_token: string, _signal?: AbortSignal) => [MOCK_ADMIN]
