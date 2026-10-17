import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markMigrationApplied, readAppliedMigrations } from './dataVersions'

interface MigrationRow {
  appliedAt: string
  collection: 'migrations'
  count: number
  hash?: string
  scope: string
}

/**
 * The four states a migration's row can be in when a run finishes, against DynamoDB-local: no row,
 * a row from before hashes existed and a row with a different hash take the mark; an equal hash
 * keeps the mark that is there.
 */
describe('markMigrationApplied against DynamoDB-local', () => {
  const client = new CustomDynamoClient('DataVersionTable')
  const read = (scope: string) => client.read<MigrationRow>({ collection: 'migrations', scope })

  it('records a migration that has no row', async () => {
    const name = uniqueId('migration')

    await markMigrationApplied(name, 3, 'hash-1')

    await expect(read(name)).resolves.toEqual({
      appliedAt: expect.any(String),
      collection: 'migrations',
      count: 3,
      hash: 'hash-1',
      scope: name,
    })
  })

  it('takes a row written before hashes existed', async () => {
    const name = uniqueId('migration')
    await client.write({ appliedAt: '2025-01-01T00:00:00.000Z', collection: 'migrations', count: 1, scope: name })

    await markMigrationApplied(name, 5, 'hash-1')

    await expect(read(name)).resolves.toMatchObject({ count: 5, hash: 'hash-1' })
  })

  it('takes a row whose hash differs, the migration having changed', async () => {
    const name = uniqueId('migration')
    await markMigrationApplied(name, 1, 'hash-1')

    await markMigrationApplied(name, 7, 'hash-2')

    await expect(read(name)).resolves.toMatchObject({ count: 7, hash: 'hash-2' })
  })

  it('leaves a row with an equal hash as it is, already recorded by a concurrent run', async () => {
    const name = uniqueId('migration')
    await markMigrationApplied(name, 9, 'hash-1')
    const recorded = await read(name)

    await markMigrationApplied(name, 0, 'hash-1')

    await expect(read(name)).resolves.toEqual(recorded)
  })

  it('reads the hashes of the named migrations, undefined for an unknown or hashless one', async () => {
    const hashed = uniqueId('migration')
    const hashless = uniqueId('migration')
    const unknown = uniqueId('migration')
    await markMigrationApplied(hashed, 1, 'hash-1')
    await client.write({ appliedAt: '2025-01-01T00:00:00.000Z', collection: 'migrations', count: 1, scope: hashless })

    const applied = await readAppliedMigrations([hashed, hashless, unknown])

    // A batchGet answers in no promised order
    expect(applied.size).toBe(2)
    expect(applied.get(hashed)).toBe('hash-1')
    expect(applied.has(hashless)).toBe(true)
    expect(applied.get(hashless)).toBeUndefined()
    expect(applied.has(unknown)).toBe(false)
  })
})
