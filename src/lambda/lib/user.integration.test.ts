import { storedUser } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { findUserByEmail } from './user'

describe('findUserByEmail against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  it('reads the user through gsiEmail from a mixed-case, padded address', async () => {
    const stored = storedUser()
    await client.write(stored)

    await expect(findUserByEmail(`  ${stored.email.toUpperCase()} `)).resolves.toEqual(stored)
  })

  it('does not return a deleted user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deleted = storedUser({ deletedAt: '2026-02-01T00:00:00.000Z' })
    await client.write(deleted)

    await expect(findUserByEmail(deleted.email)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
