import { vi } from 'vitest'

const mockBatchGet = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { dataVersionTable: 'data-version-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    batchGet = (...args: unknown[]) => mockBatchGet(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const {
  readAllVersionRecords,
  readMigrationHashes,
  readVersionRecords,
  recordMigration,
  writeFingerprint,
  writeRevision,
} = await import('./dataVersionRepository')

const NOW = '2026-08-30T12:00:00.000Z'

describe('dataVersionRepository', () => {
  beforeEach(() => {
    mockBatchGet.mockReset().mockResolvedValue([])
    mockReadAll.mockReset()
    mockUpdate.mockReset().mockResolvedValue({})
  })

  it('opens its client on the data version table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('data-version-table')
  })

  describe('readVersionRecords', () => {
    it('reads the rows by collection and scope in one batchGet', async () => {
      const record = { collection: 'users', revision: 'aaa', scope: 'org1' }
      mockBatchGet.mockResolvedValueOnce([record])

      await expect(
        readVersionRecords([
          { collection: 'judges', scope: '*' },
          { collection: 'users', scope: 'org1' },
        ])
      ).resolves.toEqual([record])
      expect(mockBatchGet).toHaveBeenCalledTimes(1)
      expect(mockBatchGet).toHaveBeenCalledWith([
        { collection: 'judges', scope: '*' },
        { collection: 'users', scope: 'org1' },
      ])
    })
  })

  describe('readAllVersionRecords', () => {
    it('keeps migration rows out of what the weekly repair measures', async () => {
      const version = { collection: 'judges', count: 2, revision: 'aaa', scope: '*' }
      mockReadAll.mockResolvedValueOnce([
        version,
        { appliedAt: NOW, collection: 'migrations', count: 3, scope: 'backfillOrganizerId' },
      ])

      await expect(readAllVersionRecords()).resolves.toEqual([version])
      expect(mockReadAll).toHaveBeenCalledWith()
    })

    it('reads an empty table as no rows', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readAllVersionRecords()).resolves.toEqual([])
    })
  })

  describe('writeRevision', () => {
    it('sets the revision and its time on the scope of the collection', async () => {
      await writeRevision('users', 'org1', { modifiedAt: NOW, revision: 'rev-1' })

      expect(mockUpdate).toHaveBeenCalledWith(
        { collection: 'users', scope: 'org1' },
        { set: { modifiedAt: NOW, revision: 'rev-1' } }
      )
    })
  })

  describe('writeFingerprint', () => {
    it('stores the fingerprint alone without a revision', async () => {
      await writeFingerprint('judges', '*', { count: 3, fingerprintAt: NOW })

      expect(mockUpdate).toHaveBeenCalledWith(
        { collection: 'judges', scope: '*' },
        { set: { count: 3, fingerprintAt: NOW } }
      )
    })

    it('stores an empty time for data without one, and the revision when given', async () => {
      await writeFingerprint('organizers', '*', { count: 2 }, { modifiedAt: NOW, revision: 'rev-2' })

      expect(mockUpdate).toHaveBeenCalledWith(
        { collection: 'organizers', scope: '*' },
        { set: { count: 2, fingerprintAt: '', modifiedAt: NOW, revision: 'rev-2' } }
      )
    })
  })

  describe('readMigrationHashes', () => {
    it('reads the named migrations in one batchGet and returns the stored hashes', async () => {
      mockBatchGet.mockResolvedValueOnce([
        { appliedAt: NOW, collection: 'migrations', count: 3, hash: 'abc123', scope: 'backfillOrganizerId' },
        { appliedAt: NOW, collection: 'migrations', count: 1, scope: 'fixSeasonFromStartDate' },
      ])

      const applied = await readMigrationHashes(['backfillOrganizerId', 'fixSeasonFromStartDate'])

      expect(mockBatchGet).toHaveBeenCalledTimes(1)
      expect(mockBatchGet).toHaveBeenCalledWith([
        { collection: 'migrations', scope: 'backfillOrganizerId' },
        { collection: 'migrations', scope: 'fixSeasonFromStartDate' },
      ])
      // A row from before hashes existed maps to undefined, like one never written
      expect(applied).toEqual(
        new Map([
          ['backfillOrganizerId', 'abc123'],
          ['fixSeasonFromStartDate', undefined],
        ])
      )
      expect(applied.get('neverRecorded')).toBeUndefined()
    })
  })

  describe('recordMigration', () => {
    // The expression is what DynamoDB judges, which a mock cannot: dataVersions.integration.test.ts
    // runs it against DynamoDB-local for the four row states.
    it('writes the time, the rows changed and the hash unless the row holds the same hash', async () => {
      await expect(recordMigration('backfillOrganizerId', 4, 'abc123', NOW)).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { collection: 'migrations', scope: 'backfillOrganizerId' },
        { set: { appliedAt: NOW, count: 4, hash: 'abc123' } },
        undefined,
        undefined,
        {
          expression: 'attribute_not_exists(#hash) OR #hash <> :hash',
          names: { '#hash': 'hash' },
          values: { ':hash': 'abc123' },
        }
      )
    })

    it('says it did not write when a run already recorded the same hash', async () => {
      mockUpdate.mockRejectedValueOnce(
        Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })
      )

      await expect(recordMigration('backfillOrganizerId', 0, 'abc123', NOW)).resolves.toBe(false)
    })

    it('does not swallow any other failure', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('throttled'))

      await expect(recordMigration('backfillOrganizerId', 0, 'abc123', NOW)).rejects.toThrow('throttled')
    })
  })
})
