import type { User } from '../types'
import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getUser, getUsers, putAdmin, putRole, putUser, putUserName } from './user'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

/** A user as the server writes it: the row's stamps and the last visit as ISO strings. */
const wireUser = {
  createdAt: '2026-01-02T10:00:00.000Z',
  createdBy: 'seed',
  email: 'a@b.c',
  id: 'u1',
  lastSeen: '2026-05-01T08:00:00.000Z',
  modifiedAt: '2026-01-03T10:00:00.000Z',
  modifiedBy: 'seed',
  // A name that looks like a day stays text.
  name: '2026-05-01',
}

const modelUser: User = {
  ...wireUser,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  lastSeen: new Date('2026-05-01T08:00:00.000Z'),
  modifiedAt: new Date('2026-01-03T10:00:00.000Z'),
}

test('getUser makes the stamps and the last visit Dates (KOE-1546)', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(wireUser))

  await expect(getUser('token')).resolves.toEqual(modelUser)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/user`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) })
  )
})

test('getUsers converts a full list and an incremental response alike', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([wireUser]))
  await expect(getUsers('token')).resolves.toEqual([modelUser])
  expect(fetchMock).toHaveBeenLastCalledWith(`${API_BASE_URL}/admin/user`, expect.any(Object))

  fetchMock.mockResponseOnce(JSON.stringify({ cursor: 456, deletedIds: ['gone'], items: [wireUser] }))
  await expect(getUsers('token', undefined, new Date(123))).resolves.toEqual({
    cursor: 456,
    deletedIds: ['gone'],
    items: [modelUser],
  })
  expect(fetchMock).toHaveBeenLastCalledWith(`${API_BASE_URL}/admin/user?since=123`, expect.any(Object))
})

test.each([
  ['putUser', () => putUser(modelUser, 'token'), '/admin/user'],
  ['putAdmin', () => putAdmin({ admin: true, userId: 'u1' }, 'token'), '/admin/user/admin'],
  ['putRole', () => putRole({ orgId: 'org', role: 'admin', userId: 'u1' }, 'token'), '/admin/user/role'],
])('%s answers with the user as stored, its stamps Dates', async (_name, call, path) => {
  fetchMock.mockResponseOnce(JSON.stringify(wireUser))

  await expect(call()).resolves.toEqual(modelUser)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}${path}`, expect.objectContaining({ method: 'POST' }))
})

test('putUserName answers with the name as saved', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ email: 'a@b.c', id: 'u1', name: 'New Name' }))

  await expect(putUserName('New Name', 'token')).resolves.toEqual({ email: 'a@b.c', id: 'u1', name: 'New Name' })
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/user/name`,
    expect.objectContaining({ body: JSON.stringify({ name: 'New Name' }), method: 'POST' })
  )
})
