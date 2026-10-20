import { storedUser } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { changedItemsSince } from '../incremental'
import { queryUsersByEmail, readUser, writeMigratedUserRoles } from './userRepository'

/**
 * The organizer repoint (KOE-1580) writes a user's roles on condition the map is still the one read:
 * DynamoDB compares the maps by value, so a role granted or taken meanwhile refuses the write.
 */
describe('writeMigratedUserRoles against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  it('replaces the roles of a row that still holds the roles read, and nothing else', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' } })
    await client.write(user)

    await writeMigratedUserRoles(
      user.id,
      { aikpqWfqeB: 'secretary', other: 'admin' },
      user.roles,
      '2026-10-20T12:00:00.000Z'
    )

    await expect(readUser(user.id, true)).resolves.toEqual({
      ...user,
      roles: { aikpqWfqeB: 'secretary', other: 'admin' },
      updatedAt: '2026-10-20T12:00:00.000Z',
    })
  })

  it('makes the row one the user list hands to clients that cached it before the migration', async () => {
    // A row last edited long ago: by its modifiedAt alone it is unchanged since any recent fetch
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary' } })
    await client.write(user)
    const lastFetch = new Date()

    await writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary' }, user.roles, new Date().toISOString())

    const stored = await readUser(user.id, true)
    expect(stored?.modifiedAt).toBe(user.modifiedAt)
    expect(changedItemsSince(stored ? [stored] : [], lastFetch)).toEqual([stored])
  })

  it('refuses a row whose roles changed since they were read', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary' } })
    await client.write({ ...user, roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' } })

    await expect(
      writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary' }, user.roles, '2026-10-20T12:00:00.000Z')
    ).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(readUser(user.id, true)).resolves.toMatchObject({
      roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' },
    })
  })

  it('creates no row for a user deleted meanwhile', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary' } })

    await expect(
      writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary' }, user.roles, '2026-10-20T12:00:00.000Z')
    ).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(readUser(user.id, true)).resolves.toBeUndefined()
  })
})

// KOE-1585: query leaves deleted rows out by default; the email lookup asks for them, and its callers
// tell a deleted user from a live one.
describe('queryUsersByEmail against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  it('hands back the deleted users stored under the address with the live ones', async () => {
    const live = storedUser()
    const deleted = storedUser({ deletedAt: '2026-10-01T10:00:00.000Z', email: live.email })
    await client.batchWrite([live, deleted])

    const users = await queryUsersByEmail(live.email)

    expect(users).toHaveLength(2)
    expect(users).toEqual(expect.arrayContaining([live, deleted]))
  })
})
