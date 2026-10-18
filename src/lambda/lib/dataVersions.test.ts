import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
// Reset between tests so each one can assert the exact revision it produced.
const revision = vi.hoisted(() => ({ next: 0 }))
vi.doMock('nanoid', () => ({ nanoid: () => `test-revision-${++revision.next}` }))

const mockReadVersionRecords = vi.fn()
const mockWriteRevision = vi.fn()
const mockReadAllVersionRecords = vi.fn()
const mockReadMigrationHashes = vi.fn()
const mockRecordMigration = vi.fn()
const mockWriteFingerprint = vi.fn()

vi.doMock('./repositories/dataVersionRepository', () => ({
  readAllVersionRecords: mockReadAllVersionRecords,
  readMigrationHashes: mockReadMigrationHashes,
  readVersionRecords: mockReadVersionRecords,
  recordMigration: mockRecordMigration,
  writeFingerprint: mockWriteFingerprint,
  writeRevision: mockWriteRevision,
}))

const {
  bumpDataVersion,
  getDataVersions,
  markMigrationApplied,
  readAppliedMigrations,
  readStoredDataVersions,
  writeDataVersionFingerprint,
} = await import('./dataVersions')

const NOW = '2026-08-30T12:00:00.000Z'

describe('getDataVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadVersionRecords.mockResolvedValue([])
  })

  it('reads one row per global collection and per caller scope', async () => {
    await getDataVersions(['directory', 'org1', 'org2'])

    expect(mockReadVersionRecords).toHaveBeenCalledTimes(1)
    expect(mockReadVersionRecords).toHaveBeenCalledWith([
      { collection: 'emailTemplates', scope: '*' },
      { collection: 'eventTypes', scope: '*' },
      { collection: 'judges', scope: '*' },
      { collection: 'locations', scope: '*' },
      { collection: 'officials', scope: '*' },
      { collection: 'organizers', scope: '*' },
      { collection: 'users', scope: 'directory' },
      { collection: 'users', scope: 'org1' },
      { collection: 'users', scope: 'org2' },
    ])
  })

  it('reads a single row for a global admin', async () => {
    await getDataVersions(['*'])

    expect(mockReadVersionRecords).toHaveBeenCalledWith(expect.arrayContaining([{ collection: 'users', scope: '*' }]))
    expect(mockReadVersionRecords).toHaveBeenCalledWith(
      expect.not.arrayContaining([{ collection: 'users', scope: 'org1' }])
    )
  })

  it('composes the users version from every caller scope', async () => {
    mockReadVersionRecords.mockResolvedValueOnce([
      { collection: 'users', modifiedAt: '2026-01-02T00:00:00.000Z', revision: 'aaa', scope: 'org1' },
      { collection: 'users', modifiedAt: '2026-01-03T00:00:00.000Z', revision: 'bbb', scope: 'directory' },
    ])

    const versions = await getDataVersions(['directory', 'org1'])

    expect(versions.users).toEqual({
      modifiedAt: '2026-01-03T00:00:00.000Z',
      revision: 'directory:bbb|org1:aaa',
    })
  })

  it('reports an initial revision for collections nothing has bumped', async () => {
    const versions = await getDataVersions(['directory', 'org1'])

    expect(versions.judges).toEqual({ modifiedAt: undefined, revision: '*:initial' })
    expect(versions.users).toEqual({ modifiedAt: undefined, revision: 'directory:initial|org1:initial' })
  })

  it('changes the users version when the caller changes organization', async () => {
    const before = await getDataVersions(['directory', 'org1'])
    const after = await getDataVersions(['directory', 'org1', 'org2'])

    expect(after.users.revision).not.toEqual(before.users.revision)
  })
})

describe('bumpDataVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revision.next = 0
    mockWriteRevision.mockResolvedValue(undefined)
  })

  it('remints the global scope by default', async () => {
    await bumpDataVersion('judges')

    expect(mockWriteRevision).toHaveBeenCalledTimes(1)
    expect(mockWriteRevision).toHaveBeenCalledWith('judges', '*', { modifiedAt: NOW, revision: 'test-revision-1' })
  })

  it('remints every scope with the same revision, deduplicated', async () => {
    await bumpDataVersion('users', ['*', 'org1', 'org1', 'directory'])

    expect(mockWriteRevision).toHaveBeenCalledTimes(3)
    expect(mockWriteRevision).toHaveBeenNthCalledWith(1, 'users', '*', {
      modifiedAt: NOW,
      revision: 'test-revision-1',
    })
    expect(mockWriteRevision).toHaveBeenNthCalledWith(2, 'users', 'org1', {
      modifiedAt: NOW,
      revision: 'test-revision-1',
    })
    expect(mockWriteRevision).toHaveBeenNthCalledWith(3, 'users', 'directory', {
      modifiedAt: NOW,
      revision: 'test-revision-1',
    })
  })

  it('produces a different revision on every bump', async () => {
    await bumpDataVersion('judges')
    await bumpDataVersion('judges')

    expect(mockWriteRevision).toHaveBeenNthCalledWith(1, 'judges', '*', {
      modifiedAt: NOW,
      revision: 'test-revision-1',
    })
    expect(mockWriteRevision).toHaveBeenNthCalledWith(2, 'judges', '*', {
      modifiedAt: NOW,
      revision: 'test-revision-2',
    })
  })

  it('does not fail the write that triggered it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockWriteRevision.mockRejectedValueOnce(new Error('AccessDenied'))

    await expect(bumpDataVersion('judges')).resolves.toBeUndefined()
    expect(loggedLines(error)).toContainEqual(
      expect.objectContaining({
        collection: 'judges',
        error: expect.objectContaining({ message: 'AccessDenied' }),
        message: 'failed to bump data version',
        scopes: ['*'],
      })
    )
    error.mockRestore()
  })

  it('does nothing without scopes', async () => {
    await bumpDataVersion('users', [])

    expect(mockWriteRevision).not.toHaveBeenCalled()
  })
})

describe('migration registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the stored hashes of the named migrations', async () => {
    const hashes = new Map([['backfillOrganizerId', 'abc123']])
    mockReadMigrationHashes.mockResolvedValueOnce(hashes)

    await expect(readAppliedMigrations(['backfillOrganizerId'])).resolves.toBe(hashes)
    expect(mockReadMigrationHashes).toHaveBeenCalledWith(['backfillOrganizerId'])
  })

  it('records a migration with the time, the rows it changed and the hash of its code', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mockRecordMigration.mockResolvedValueOnce(true)

    await markMigrationApplied('backfillOrganizerId', 4, 'abc123')

    expect(mockRecordMigration).toHaveBeenCalledWith('backfillOrganizerId', 4, 'abc123', NOW)
    expect(loggedLines(info)).toEqual([])
    info.mockRestore()
  })

  it('leaves an earlier mark alone when a concurrent run already recorded it', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mockRecordMigration.mockResolvedValueOnce(false)

    await expect(markMigrationApplied('backfillOrganizerId', 0, 'abc123')).resolves.toBeUndefined()
    expect(loggedLines(info)).toContainEqual(
      expect.objectContaining({ message: 'migration already recorded', name: 'backfillOrganizerId' })
    )
    info.mockRestore()
  })

  it('does not swallow any other failure of the mark', async () => {
    mockRecordMigration.mockRejectedValueOnce(new Error('throttled'))

    await expect(markMigrationApplied('backfillOrganizerId', 0, 'abc123')).rejects.toThrow('throttled')
  })
})

describe('weekly repair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revision.next = 0
  })

  it('reads the stored version rows', async () => {
    const version = { collection: 'judges', count: 2, revision: 'aaa', scope: '*' }
    mockReadAllVersionRecords.mockResolvedValueOnce([version])

    await expect(readStoredDataVersions()).resolves.toEqual([version])
  })

  it('records a fingerprint without touching the revision', async () => {
    await writeDataVersionFingerprint('judges', '*', { count: 3, fingerprintAt: NOW }, false)

    expect(mockWriteFingerprint).toHaveBeenCalledWith('judges', '*', { count: 3, fingerprintAt: NOW }, undefined)
  })

  it('remints the revision with the fingerprint when the data moved without a bump', async () => {
    await writeDataVersionFingerprint('users', 'org1', { count: 1 }, true)

    expect(mockWriteFingerprint).toHaveBeenCalledWith(
      'users',
      'org1',
      { count: 1 },
      { modifiedAt: NOW, revision: 'test-revision-1' }
    )
  })
})
