import { vi } from 'vitest'

const mockCreateConnection = vi.fn()
const mockAuthenticateConnection = vi.fn()
const mockGetConnection = vi.fn()
const mockQueryPublicConnections = vi.fn()
const mockRemoveConnection = vi.fn()
const mockGetEvent = vi.fn()

vi.doMock('./connectionRepository', () => ({
  authenticateConnection: mockAuthenticateConnection,
  createConnection: mockCreateConnection,
  getConnection: mockGetConnection,
  queryPublicConnections: mockQueryPublicConnections,
  removeConnection: mockRemoveConnection,
}))

vi.doMock('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const { authenticateWebSocket, connectWebSocket, disconnectWebSocket } = await import('./connectionLifecycle')

describe('ws/connectionLifecycle', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockQueryPublicConnections.mockResolvedValue([])
  })

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('connectWebSocket writes connection', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))

    await connectWebSocket({ connectionId: 'c1' })

    expect(mockQueryPublicConnections).toHaveBeenCalledWith()
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1', expiresAt: 1779570000 })
    expect(logSpy).toHaveBeenCalledWith('wsConnect: c1', { connectionId: 'c1' })
  })

  it('connectWebSocket rejects when public connection limit is reached', async () => {
    mockQueryPublicConnections.mockResolvedValue(
      Array.from({ length: 1000 }, (_, index) => ({ connectionId: `c${index}` }))
    )

    await expect(connectWebSocket({ connectionId: 'c1001' })).rejects.toMatchObject({
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
    expect(logSpy).toHaveBeenCalledWith('wsAuthenticate: c1', {
      admin: undefined,
      connectionId: 'c1',
      expiresAt: undefined,
      memberOf: ['org-1'],
      userEmail: 'user@example.com',
      userId: 'u1',
      userName: 'User One',
    })
  })

  it('disconnectWebSocket removes and notifies viewers when subscribed', async () => {
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1', eventId: 'e1' })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const notifyEventViewers = vi.fn().mockResolvedValue(undefined)

    await disconnectWebSocket('c1', { notifyEventViewers })

    expect(mockRemoveConnection).toHaveBeenCalledWith('c1')
    expect(notifyEventViewers).toHaveBeenCalledWith('e1', 'org-1')
    expect(logSpy).toHaveBeenCalledWith('wsDisconnect: c1')
  })
})
