import { storedUser } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readUser, writeMigratedUserRoles } from './userRepository'

/**
 * The organizer repoint (KOE-1580) writes a user's roles on condition the map is still the one read:
 * DynamoDB compares the maps by value, so a role granted or taken meanwhile refuses the write.
 */
describe('writeMigratedUserRoles against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  it('replaces the roles of a row that still holds the roles read, and nothing else', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' } })
    await client.write(user)

    await writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary', other: 'admin' }, user.roles)

    await expect(readUser(user.id, true)).resolves.toEqual({
      ...user,
      roles: { aikpqWfqeB: 'secretary', other: 'admin' },
    })
  })

  it('refuses a row whose roles changed since they were read', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary' } })
    await client.write({ ...user, roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' } })

    await expect(writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary' }, user.roles)).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(readUser(user.id, true)).resolves.toMatchObject({
      roles: { '-ZC1Jcewbn': 'secretary', other: 'admin' },
    })
  })

  it('creates no row for a user deleted meanwhile', async () => {
    const user = storedUser({ roles: { '-ZC1Jcewbn': 'secretary' } })

    await expect(writeMigratedUserRoles(user.id, { aikpqWfqeB: 'secretary' }, user.roles)).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    })
    await expect(readUser(user.id, true)).resolves.toBeUndefined()
  })
})
