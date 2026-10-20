import type { JsonUser } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockQuery = vi.fn()
const mockWrite = vi.fn()
const mockBatchWrite = vi.fn()
const mockUpdate = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { userTable: 'user-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    query = (...args: unknown[]) => mockQuery(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const {
  queryUsersByEmail,
  readAllUsers,
  readUser,
  writeMigratedUserRoles,
  writeUser,
  writeUserAdmin,
  writeUserRoles,
  writeUsers,
} = await import('./userRepository')

const user: JsonUser = {
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'system',
  email: 'user@example.com',
  id: 'user-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'system',
  name: 'User Person',
}

describe('userRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockQuery.mockReset()
    mockWrite.mockReset()
    mockBatchWrite.mockReset()
    mockUpdate.mockReset()
  })

  it('opens its client on the user table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('user-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readUser reads the user by id', async () => {
    mockRead.mockResolvedValueOnce(user)

    await expect(readUser('user-1')).resolves.toEqual(user)
    expect(mockRead).toHaveBeenCalledWith({ id: 'user-1' }, false)
  })

  it('readUser reads the row as last written when asked to', async () => {
    mockRead.mockResolvedValueOnce(user)

    await readUser('user-1', true)

    expect(mockRead).toHaveBeenCalledWith({ id: 'user-1' }, true)
  })

  it('readUser answers undefined for a missing user', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readUser('missing')).resolves.toBeUndefined()
  })

  it('readAllUsers scans the whole table without the deleted rows', async () => {
    mockReadAll.mockResolvedValueOnce([user])

    await expect(readAllUsers()).resolves.toEqual([user])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readAllUsers answers an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readAllUsers()).resolves.toEqual([])
  })

  it('queryUsersByEmail queries gsiEmail with the address as given', async () => {
    mockQuery.mockResolvedValueOnce([user])

    await expect(queryUsersByEmail('User+tag@Example.com')).resolves.toEqual([user])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'gsiEmail',
      key: 'email = :email',
      values: { ':email': 'User+tag@Example.com' },
    })
  })

  it('queryUsersByEmail answers an empty list when the query returns nothing', async () => {
    mockQuery.mockResolvedValueOnce(undefined)

    await expect(queryUsersByEmail('nobody@example.com')).resolves.toEqual([])
  })

  it('writeUser puts the record as given and returns the client result', async () => {
    mockWrite.mockResolvedValueOnce('written')

    await expect(writeUser(user)).resolves.toBe('written')
    expect(mockWrite).toHaveBeenCalledWith(user)
  })

  it('writeUsers batch writes the records as given', async () => {
    const other = { ...user, id: 'user-2' }

    await writeUsers([user, other])
    expect(mockBatchWrite).toHaveBeenCalledWith([user, other])
  })

  it('writeUserRoles sets the roles with the modification stamp', async () => {
    await writeUserRoles('user-1', { org1: 'admin' }, '2024-02-01T00:00:00.000Z', 'Admin')

    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'user-1' },
      { set: { modifiedAt: '2024-02-01T00:00:00.000Z', modifiedBy: 'Admin', roles: { org1: 'admin' } } }
    )
  })

  it('writeMigratedUserRoles sets the roles and updatedAt, on a row that still has the roles it was read with', async () => {
    await writeMigratedUserRoles('user-1', { live: 'admin' }, { orphan: 'admin' }, '2026-10-20T00:00:00.000Z')

    const set = { roles: { live: 'admin' }, updatedAt: '2026-10-20T00:00:00.000Z' }
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'user-1' }, { set }, undefined, {
      expression: 'attribute_exists(#id) AND #roles = :foldedFrom',
      names: { '#id': 'id', '#roles': 'roles' },
      values: { ':foldedFrom': { orphan: 'admin' } },
    })
  })

  it('writeUserAdmin sets the admin flag with the modification stamp', async () => {
    await writeUserAdmin('user-1', true, '2024-02-01T00:00:00.000Z', 'Admin')

    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'user-1' },
      { set: { admin: true, modifiedAt: '2024-02-01T00:00:00.000Z', modifiedBy: 'Admin' } }
    )
  })
})
