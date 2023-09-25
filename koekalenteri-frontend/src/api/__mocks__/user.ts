import type { User } from 'koekalenteri-shared/model'

const MOCK_ADMIN: User = {
  id: 'asdf1234',
  name: 'Test User',
  email: 'test@user.jest',
  admin: true,
}

export async function getUser(token: string, signal?: AbortSignal) {
  return MOCK_ADMIN
}

export async function getUsers(token: string, signal?: AbortSignal) {
  return [MOCK_ADMIN]
}
