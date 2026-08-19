import { vi } from 'vitest'

const mockRead = vi.fn()
const mockUpdate = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    read: mockRead,
    update: mockUpdate,
  })),
}))

const { default: CustomDynamoClient } = await import('../utils/CustomDynamoClient')
const { createDynamoLease } = await import('./lease')

describe('createDynamoLease', () => {
  const client = new CustomDynamoClient('item-table')
  const lease = createDynamoLease<
    { id: string; processedAt?: string; processingLease?: { expiresAt: number; token: string } },
    'processedAt'
  >({
    client,
    durationMs: 30_000,
    itemExistsField: 'id',
    leaseField: 'processingLease',
    table: 'item-table',
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('claims an available lease and rereads the item consistently', async () => {
    const item = { id: 'item-1' }
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce(item)

    const claim = await lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })

    expect(claim?.item).toBe(item)
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'item-1' },
      { set: { processingLease: { expiresAt: Date.now() + 30_000, token: claim?.token } } },
      'item-table',
      undefined,
      {
        expression:
          'attribute_exists(#id) AND (attribute_not_exists(#processingLease) OR #processingLease.#expiresAt < :now)',
        names: { '#expiresAt': 'expiresAt', '#id': 'id', '#processingLease': 'processingLease' },
        values: { ':now': Date.now() },
      }
    )
    expect(mockRead).toHaveBeenCalledWith({ id: 'item-1' }, 'item-table', true)
  })

  it('returns undefined when another worker owns the lease', async () => {
    mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(
      lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })
    ).resolves.toBeUndefined()
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('propagates an acquisition failure that is not a lease conflict', async () => {
    const failure = new Error('DynamoDB unavailable')
    mockUpdate.mockRejectedValueOnce(failure)

    await expect(lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })).rejects.toBe(failure)
  })

  it('fails if the claimed item disappears before the consistent read', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce(undefined)

    await expect(lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })).rejects.toThrow(
      'Item disappeared'
    )
  })

  it('releases only the lease owned by its token and ignores a takeover', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce({ id: 'item-1' })
    const claim = await lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })
    mockUpdate.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(claim?.release()).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenLastCalledWith(
      { id: 'item-1' },
      { remove: ['processingLease'] },
      'item-table',
      undefined,
      {
        expression: '#processingLease.#token = :token',
        names: { '#processingLease': 'processingLease', '#token': 'token' },
        values: { ':token': claim?.token },
      }
    )
  })

  it('propagates a release failure that is not a lease takeover', async () => {
    const failure = new Error('DynamoDB unavailable')
    mockUpdate.mockResolvedValueOnce(undefined)
    mockRead.mockResolvedValueOnce({ id: 'item-1' })
    const claim = await lease.claim({ key: { id: 'item-1' }, missingItemMessage: 'Item disappeared' })
    mockUpdate.mockRejectedValueOnce(failure)

    await expect(claim?.release()).rejects.toBe(failure)
  })

  it('marks a phase only while the caller owns the lease', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)

    await lease.markPhase({ id: 'item-1' }, 'lease-token', 'processedAt')

    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'item-1' },
      { set: { processedAt: '2026-08-16T12:00:00.000Z' } },
      'item-table',
      undefined,
      {
        expression: '#processingLease.#token = :token',
        names: { '#processingLease': 'processingLease', '#token': 'token' },
        values: { ':token': 'lease-token' },
      }
    )
  })
})
