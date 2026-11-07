import { vi } from 'vitest'
import { hashIdentity } from '../../lib/log'
import { loggedLines } from '../../test-utils/logs'

const mockCreateConnection = vi.fn()
const mockAuthenticateConnection = vi.fn()
const mockGetConnection = vi.fn()
const mockCountOpenConnectionsInSourceBucket = vi.fn()
const mockCountOpenPublicConnections = vi.fn()
const mockRemoveConnection = vi.fn()
const mockGetEvent = vi.fn()

vi.doMock('./connectionRepository', () => ({
  authenticateConnection: mockAuthenticateConnection,
  countOpenConnectionsInSourceBucket: mockCountOpenConnectionsInSourceBucket,
  countOpenPublicConnections: mockCountOpenPublicConnections,
  createConnection: mockCreateConnection,
  getConnection: mockGetConnection,
  removeConnection: mockRemoveConnection,
}))

vi.doMock('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const { authenticateWebSocket, connectWebSocket, disconnectWebSocket } = await import('./connectionLifecycle')

describe('ws/connectionLifecycle', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockCountOpenConnectionsInSourceBucket.mockResolvedValue(0)
    mockCountOpenPublicConnections.mockResolvedValue(0)
  })

  afterAll(() => {
    infoSpy.mockRestore()
  })

  const sourceIp = '203.0.113.7'
  const sourceBucket = hashIdentity(sourceIp).slice(0, 5)

  it('connectWebSocket writes the connection with the bucket of its source', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))

    await connectWebSocket({ connectionId: 'c1' }, sourceIp)

    expect(mockCountOpenConnectionsInSourceBucket).toHaveBeenCalledWith(sourceBucket, 20)
    expect(mockCountOpenPublicConnections).toHaveBeenCalledWith(1000)
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1', expiresAt: 1779570000, sourceBucket })
    expect(loggedLines(infoSpy)).toContainEqual(expect.objectContaining({ connectionId: 'c1', message: 'wsConnect' }))
  })

  it('connectWebSocket stores and logs only a 20-bit bucket of the source', async () => {
    await connectWebSocket({ connectionId: 'c1' }, sourceIp)

    expect(sourceBucket).toMatch(/^[\da-f]{5}$/)
    expect(mockCountOpenConnectionsInSourceBucket).toHaveBeenCalledWith(sourceBucket, 20)
    expect(mockCreateConnection).toHaveBeenCalledWith({
      connectionId: 'c1',
      expiresAt: expect.any(Number),
      sourceBucket,
    })
    const logged = JSON.stringify(loggedLines(infoSpy))
    expect(logged).not.toContain(sourceIp)
    expect(logged).not.toContain(hashIdentity(sourceIp))
  })

  it('connectWebSocket refuses a source at its limit, without reading the public count or writing', async () => {
    mockCountOpenConnectionsInSourceBucket.mockResolvedValue(20)

    await expect(connectWebSocket({ connectionId: 'c21' }, sourceIp)).rejects.toMatchObject({
      error: 'Too many websocket connections from one source',
      status: 429,
    })
    expect(mockCountOpenPublicConnections).not.toHaveBeenCalled()
    expect(mockCreateConnection).not.toHaveBeenCalled()
  })

  it('connectWebSocket lets a source below its limit connect', async () => {
    mockCountOpenConnectionsInSourceBucket.mockResolvedValue(19)

    await connectWebSocket({ connectionId: 'c20' }, sourceIp)

    expect(mockCreateConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'c20', sourceBucket }))
  })

  // The issue's done criterion: one source cannot keep the others out.
  it('connectWebSocket lets another source connect while one is at its limit', async () => {
    const fullBucket = hashIdentity('198.51.100.1').slice(0, 5)
    mockCountOpenConnectionsInSourceBucket.mockImplementation(async (bucket: string) =>
      bucket === fullBucket ? 20 : 0
    )

    await expect(connectWebSocket({ connectionId: 'full' }, '198.51.100.1')).rejects.toMatchObject({ status: 429 })
    await connectWebSocket({ connectionId: 'other' }, sourceIp)

    expect(mockCreateConnection).toHaveBeenCalledTimes(1)
    expect(mockCreateConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'other', sourceBucket }))
  })

  it.each([
    ['empty', ''],
    ['missing', undefined],
  ])('connectWebSocket connects without a source check or attribute when the source is %s', async (_name, source) => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))

    await connectWebSocket({ connectionId: 'c1' }, source)

    expect(mockCountOpenConnectionsInSourceBucket).not.toHaveBeenCalled()
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1', expiresAt: 1779570000 })
  })

  it('connectWebSocket rejects when public connection limit is reached', async () => {
    mockCountOpenPublicConnections.mockResolvedValue(1000)

    await expect(connectWebSocket({ connectionId: 'c1001' }, sourceIp)).rejects.toMatchObject({
      error: 'Too many public websocket connections',
      status: 429,
    })
    expect(mockCreateConnection).not.toHaveBeenCalled()
  })

  it('authenticateWebSocket updates connection auth metadata', async () => {
    await authenticateWebSocket({
      connectionId: 'c1',
      memberOf: ['org-1'],
      userEmail: 'user@example.com',
      userId: 'u1',
      userName: 'User One',
    })

    expect(mockAuthenticateConnection).toHaveBeenCalledWith({
      connectionId: 'c1',
      memberOf: ['org-1'],
      userEmail: 'user@example.com',
      userId: 'u1',
      userName: 'User One',
    })
    const authenticated = loggedLines(infoSpy).filter((line) => line.message === 'wsAuthenticate')
    expect(authenticated).toEqual([
      {
        connectionId: 'c1',
        emailHash: expect.any(String),
        level: 'info',
        memberOf: ['org-1'],
        message: 'wsAuthenticate',
        userId: 'u1',
      },
    ])
    // Neither the email nor the name of the person behind the connection ends up in the log.
    expect(JSON.stringify(authenticated)).not.toContain('user@example.com')
    expect(JSON.stringify(authenticated)).not.toContain('User One')
  })

  it('disconnectWebSocket removes and notifies viewers when subscribed', async () => {
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1', eventId: 'e1' })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const notifyEventViewers = vi.fn().mockResolvedValue(undefined)

    await disconnectWebSocket('c1', { notifyEventViewers })

    expect(mockRemoveConnection).toHaveBeenCalledWith('c1')
    expect(notifyEventViewers).toHaveBeenCalledWith('e1', 'org-1')
    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ connectionId: 'c1', message: 'wsDisconnect' })
    )
  })

  it('disconnectWebSocket removes the connection when the event behind its viewer push cannot be read', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1', eventId: 'e1' })
    mockGetEvent.mockRejectedValueOnce(new Error('event table down'))
    const notifyEventViewers = vi.fn().mockResolvedValue(undefined)

    await expect(disconnectWebSocket('c1', { notifyEventViewers })).resolves.toEqual({
      connectionId: 'c1',
      eventId: 'e1',
    })

    expect(mockRemoveConnection).toHaveBeenCalledWith('c1')
    expect(notifyEventViewers).not.toHaveBeenCalled()
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'live push failed', publication: 'event viewers' }),
    ])
    errorSpy.mockRestore()
  })
})
