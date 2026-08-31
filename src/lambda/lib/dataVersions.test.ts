import { vi } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
// Reset between tests so each one can assert the exact revision it produced.
const revision = vi.hoisted(() => ({ next: 0 }))
vi.doMock('nanoid', () => ({ nanoid: () => `test-revision-${++revision.next}` }))

const mockBatchGet = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { batchGet: mockBatchGet, update: mockUpdate }
  }),
}))

const { bumpDataVersion, getDataVersions } = await import('./dataVersions')

const NOW = '2026-08-30T12:00:00.000Z'

describe('getDataVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchGet.mockResolvedValue([])
  })

  it('reads one row per global collection and per caller scope', async () => {
    await getDataVersions(['directory', 'org1', 'org2'])

    expect(mockBatchGet).toHaveBeenCalledTimes(1)
    expect(mockBatchGet).toHaveBeenCalledWith([
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

    expect(mockBatchGet).toHaveBeenCalledWith(expect.arrayContaining([{ collection: 'users', scope: '*' }]))
    expect(mockBatchGet).toHaveBeenCalledWith(expect.not.arrayContaining([{ collection: 'users', scope: 'org1' }]))
  })

  it('composes the users version from every caller scope', async () => {
    mockBatchGet.mockResolvedValueOnce([
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
    mockUpdate.mockResolvedValue(undefined)
  })

  it('remints the global scope by default', async () => {
    await bumpDataVersion('judges')

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      { collection: 'judges', scope: '*' },
      { set: { modifiedAt: NOW, revision: 'test-revision-1' } }
    )
  })

  it('remints every scope with the same revision, deduplicated', async () => {
    await bumpDataVersion('users', ['*', 'org1', 'org1', 'directory'])

    expect(mockUpdate).toHaveBeenCalledTimes(3)
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      { collection: 'users', scope: '*' },
      { set: { modifiedAt: NOW, revision: 'test-revision-1' } }
    )
    expect(mockUpdate).toHaveBeenNthCalledWith(
      2,
      { collection: 'users', scope: 'org1' },
      { set: { modifiedAt: NOW, revision: 'test-revision-1' } }
    )
    expect(mockUpdate).toHaveBeenNthCalledWith(
      3,
      { collection: 'users', scope: 'directory' },
      { set: { modifiedAt: NOW, revision: 'test-revision-1' } }
    )
  })

  it('produces a different revision on every bump', async () => {
    await bumpDataVersion('judges')
    await bumpDataVersion('judges')

    expect(mockUpdate).toHaveBeenNthCalledWith(1, expect.anything(), {
      set: { modifiedAt: NOW, revision: 'test-revision-1' },
    })
    expect(mockUpdate).toHaveBeenNthCalledWith(2, expect.anything(), {
      set: { modifiedAt: NOW, revision: 'test-revision-2' },
    })
  })

  it('does not fail the write that triggered it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockUpdate.mockRejectedValueOnce(new Error('AccessDenied'))

    await expect(bumpDataVersion('judges')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('failed to bump data version', {
      collection: 'judges',
      error: expect.any(Error),
      scopes: ['*'],
    })
    error.mockRestore()
  })

  it('does nothing without scopes', async () => {
    await bumpDataVersion('users', [])

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
