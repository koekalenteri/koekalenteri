import type { JsonUser } from '../../types'
import { vi } from 'vitest'

const mockBatchGet = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { batchGet: mockBatchGet, update: mockUpdate }
  }),
}))

const { bumpDataVersion, getDataVersions } = await import('./dataVersions')

const user = (props: Partial<JsonUser>): JsonUser =>
  ({
    createdAt: '',
    createdBy: '',
    email: '',
    id: 'caller',
    modifiedAt: '',
    modifiedBy: '',
    name: '',
    ...props,
  }) as JsonUser

describe('getDataVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchGet.mockResolvedValue([])
  })

  it('reads one row per global collection and per caller scope', async () => {
    await getDataVersions(user({ roles: { org1: 'secretary', org2: 'admin' } }))

    expect(mockBatchGet).toHaveBeenCalledTimes(1)
    expect(mockBatchGet).toHaveBeenCalledWith([
      { collection: 'emailTemplates', scope: '*' },
      { collection: 'eventTypes', scope: '*' },
      { collection: 'judges', scope: '*' },
      { collection: 'locations', scope: '*' },
      { collection: 'officials', scope: '*' },
      { collection: 'users', scope: 'directory' },
      { collection: 'users', scope: 'org1' },
      { collection: 'users', scope: 'org2' },
    ])
  })

  it('reads a single global users scope for a global admin', async () => {
    await getDataVersions(user({ admin: true, roles: { org1: 'secretary' } }))

    expect(mockBatchGet.mock.calls[0][0]).toContainEqual({ collection: 'users', scope: '*' })
    expect(mockBatchGet.mock.calls[0][0]).not.toContainEqual({ collection: 'users', scope: 'org1' })
  })

  it('composes the users version from every caller scope', async () => {
    mockBatchGet.mockResolvedValueOnce([
      { collection: 'users', modifiedAt: '2026-01-02T00:00:00.000Z', revision: 'aaa', scope: 'org1' },
      { collection: 'users', modifiedAt: '2026-01-03T00:00:00.000Z', revision: 'bbb', scope: 'directory' },
    ])

    const versions = await getDataVersions(user({ roles: { org1: 'secretary' } }))

    expect(versions.users).toEqual({
      modifiedAt: '2026-01-03T00:00:00.000Z',
      revision: 'directory:bbb|org1:aaa',
    })
  })

  it('reports an initial revision for collections nothing has bumped', async () => {
    const versions = await getDataVersions(user({ roles: { org1: 'secretary' } }))

    expect(versions.judges).toEqual({ modifiedAt: undefined, revision: '*:initial' })
    expect(versions.users).toEqual({ modifiedAt: undefined, revision: 'directory:initial|org1:initial' })
  })

  it('changes the users revision when the caller changes organization', async () => {
    const before = await getDataVersions(user({ roles: { org1: 'secretary' } }))
    const after = await getDataVersions(user({ roles: { org1: 'secretary', org2: 'secretary' } }))

    expect(after.users.revision).not.toEqual(before.users.revision)
  })
})

describe('bumpDataVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
  })

  it('remints the global scope by default', async () => {
    await bumpDataVersion('judges')

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      { collection: 'judges', scope: '*' },
      { set: { modifiedAt: expect.any(String), revision: expect.any(String) } }
    )
  })

  it('remints every scope with the same revision, deduplicated', async () => {
    await bumpDataVersion('users', ['*', 'org1', 'org1', 'directory'])

    expect(mockUpdate).toHaveBeenCalledTimes(3)
    const revisions = new Set(mockUpdate.mock.calls.map((call) => call[1].set.revision))
    expect(revisions.size).toBe(1)
    expect(mockUpdate.mock.calls.map((call) => call[0].scope)).toEqual(['*', 'org1', 'directory'])
  })

  it('produces a different revision on every bump', async () => {
    await bumpDataVersion('judges')
    await bumpDataVersion('judges')

    const [first, second] = mockUpdate.mock.calls.map((call) => call[1].set.revision)
    expect(first).not.toEqual(second)
  })

  it('does not fail the write that triggered it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockUpdate.mockRejectedValueOnce(new Error('AccessDenied'))

    await expect(bumpDataVersion('judges')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('does nothing without scopes', async () => {
    await bumpDataVersion('users', [])

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
