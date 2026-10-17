import type { JsonUser } from '../../types'
import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { findUserByEmail } from './user'

describe('findUserByEmail against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  const user = (overrides: Partial<JsonUser> = {}): JsonUser => {
    const id = uniqueId('user')
    return {
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'test',
      email: `${id}@example.com`,
      id,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      name: `User ${id}`,
      ...overrides,
    }
  }

  it('reads the user through gsiEmail from a mixed-case, padded address', async () => {
    const stored = user()
    await client.write(stored)

    await expect(findUserByEmail(`  ${stored.email.toUpperCase()} `)).resolves.toEqual(stored)
  })

  it('does not return a deleted user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deleted = user({ deletedAt: '2026-02-01T00:00:00.000Z' })
    await client.write(deleted)

    await expect(findUserByEmail(deleted.email)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
