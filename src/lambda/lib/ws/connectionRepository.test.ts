import { vi } from 'vitest'

const mockRead = vi.fn()
const mockWrite = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockQuery = vi.fn()
const mockCount = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { wsConnectionsTable: 'ws-connections' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    read = (...args: unknown[]) => mockRead(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
    delete = (...args: unknown[]) => mockDelete(...args)
    query = (...args: unknown[]) => mockQuery(...args)
    count = (...args: unknown[]) => mockCount(...args)
  },
}))

const {
  authenticateConnection,
  countOpenConnectionsInSourceBucket,
  countOpenPublicConnections,
  createConnection,
  getConnection,
  queryAdminConnections,
  queryPublicConnections,
  removeConnection,
  subscribeAdminChannel,
  subscribeConnection,
  subscribePublicEventConnection,
  subscribeRegistrationConnection,
  unsubscribeAdminChannel,
  unsubscribeConnection,
  unsubscribePublicEventConnection,
  unsubscribeRegistrationConnection,
} = await import('./connectionRepository')

describe('ws/connectionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getConnection reads by connectionId', async () => {
    mockRead.mockResolvedValueOnce({ connectionId: 'c1' })
    await expect(getConnection('c1')).resolves.toEqual({ connectionId: 'c1' })
    expect(mockRead).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('subscribePublicEventConnection stores the event and leaves the audience alone', async () => {
    await subscribePublicEventConnection('c1', 'e1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { set: { publicEventId: 'e1' } })
  })

  it('unsubscribePublicEventConnection removes the event', async () => {
    await unsubscribePublicEventConnection('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { remove: ['publicEventId'] })
  })

  it('createConnection writes minimal payload when optional fields are missing', async () => {
    await createConnection({ connectionId: 'c1' })
    expect(mockWrite).toHaveBeenCalledWith({ audience: 'public', connectionId: 'c1' })
  })

  it('createConnection writes expiresAt but ignores legacy auth fields', async () => {
    // Legacy connect payloads may still carry auth fields; createConnection must ignore them
    const legacyPayload = {
      admin: true,
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userId: 'u1',
    }
    await createConnection(legacyPayload)

    expect(mockWrite).toHaveBeenCalledWith({ audience: 'public', connectionId: 'c1', expiresAt: 123 })
  })

  it('createConnection stores the source bucket when there is one', async () => {
    await createConnection({ connectionId: 'c1', expiresAt: 123, sourceBucket: 'a1b2c' })

    expect(mockWrite).toHaveBeenCalledWith({
      audience: 'public',
      connectionId: 'c1',
      expiresAt: 123,
      sourceBucket: 'a1b2c',
    })
  })

  it('authenticateConnection stores user display metadata', async () => {
    await authenticateConnection({
      admin: true,
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userEmail: 'user@example.com',
      userId: 'u1',
      userName: 'User One',
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      {
        remove: ['eventId'],
        set: {
          admin: true,
          audience: 'public',
          expiresAt: 123,
          memberOf: ['org-1'],
          userEmail: 'user@example.com',
          userId: 'u1',
          userName: 'User One',
        },
      }
    )
  })

  it('subscribeConnection moves event subscribers to admin audience', async () => {
    await subscribeConnection('c1', 'e1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { set: { audience: 'admin', eventId: 'e1' } })
  })

  it('unsubscribeConnection removes only eventId and keeps audience unchanged', async () => {
    await unsubscribeConnection('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { remove: ['eventId'] })
  })

  it('stores and removes a participant registration subscription', async () => {
    await subscribeRegistrationConnection('c1', 'e1', 'r1')
    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      { connectionId: 'c1' },
      { set: { registrationEventId: 'e1', registrationId: 'r1' } }
    )

    await unsubscribeRegistrationConnection('c1')
    expect(mockUpdate).toHaveBeenNthCalledWith(
      2,
      { connectionId: 'c1' },
      { remove: ['registrationEventId', 'registrationId'] }
    )
  })

  it('subscribeAdminChannel sets adminSubscribed and moves connection to admin audience', async () => {
    await subscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      { set: { adminSubscribed: true, audience: 'admin' } }
    )
  })

  it('unsubscribeAdminChannel removes adminSubscribed and moves connection to public audience', async () => {
    await unsubscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      { remove: ['adminSubscribed'], set: { audience: 'public' } }
    )
  })

  it('removeConnection does nothing when no existing connection', async () => {
    mockRead.mockResolvedValueOnce(undefined)
    await removeConnection('c1')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('removeConnection deletes existing connection', async () => {
    mockRead.mockResolvedValueOnce({ connectionId: 'c1' })
    await removeConnection('c1')
    expect(mockDelete).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('queryAdminConnections queries audience index', async () => {
    mockQuery.mockResolvedValueOnce([{ connectionId: 'c1' }])
    await expect(queryAdminConnections()).resolves.toEqual([{ connectionId: 'c1' }])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'audience-index',
      key: 'audience = :audience',
      values: { ':audience': 'admin' },
    })
  })

  it('queryPublicConnections queries audience index', async () => {
    mockQuery.mockResolvedValueOnce([{ connectionId: 'c1' }])
    await expect(queryPublicConnections()).resolves.toEqual([{ connectionId: 'c1' }])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'audience-index',
      key: 'audience = :audience',
      values: { ':audience': 'public' },
    })
  })

  describe('open connection counts', () => {
    beforeEach(() => {
      vi.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('countOpenConnectionsInSourceBucket counts unexpired rows through the source index', async () => {
      mockCount.mockResolvedValueOnce(3)

      await expect(countOpenConnectionsInSourceBucket('a1b2c', 20)).resolves.toBe(3)

      expect(mockCount).toHaveBeenCalledWith({
        filterExpression: 'expiresAt > :now',
        includeDeleted: true,
        index: 'source-index',
        key: 'sourceBucket = :sourceBucket',
        limit: 20,
        values: { ':now': 1779562800, ':sourceBucket': 'a1b2c' },
      })
    })

    it('countOpenPublicConnections counts unexpired public rows through the audience index', async () => {
      mockCount.mockResolvedValueOnce(7)

      await expect(countOpenPublicConnections(1000)).resolves.toBe(7)

      expect(mockCount).toHaveBeenCalledWith({
        filterExpression: 'expiresAt > :now',
        includeDeleted: true,
        index: 'audience-index',
        key: 'audience = :audience',
        limit: 1000,
        values: { ':audience': 'public', ':now': 1779562800 },
      })
    })
  })
})
