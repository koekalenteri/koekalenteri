import { jest } from '@jest/globals'

const mockCreateConnection = jest.fn<any>()
const mockAuthenticateConnection = jest.fn<any>()
const mockGetConnection = jest.fn<any>()
const mockQueryPublicConnections = jest.fn<any>()
const mockRemoveConnection = jest.fn<any>()
const mockGetEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  authenticateConnection: mockAuthenticateConnection,
  createConnection: mockCreateConnection,
  getConnection: mockGetConnection,
  queryPublicConnections: mockQueryPublicConnections,
  removeConnection: mockRemoveConnection,
}))

jest.unstable_mockModule('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const { authenticateWebSocket, connectWebSocket, disconnectWebSocket } = await import('./connectionLifecycle')

describe('ws/connectionLifecycle', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
    mockQueryPublicConnections.mockResolvedValue([])
  })

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('connectWebSocket writes connection', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))

    await connectWebSocket({ connectionId: 'c1' } as any)

    expect(mockQueryPublicConnections).toHaveBeenCalledWith()
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1', expiresAt: 1779570000 })
    expect(logSpy).toHaveBeenCalledWith('wsConnect: c1', { connectionId: 'c1' })
  })

  it('connectWebSocket rejects when public connection limit is reached', async () => {
    mockQueryPublicConnections.mockResolvedValue(
      Array.from({ length: 1000 }, (_, index) => ({ connectionId: `c${index}` }))
    )

    await expect(connectWebSocket({ connectionId: 'c1001' } as any)).rejects.toMatchObject({
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
    } as any)

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
    const notifyEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    await disconnectWebSocket('c1', { notifyEventViewers })

    expect(mockRemoveConnection).toHaveBeenCalledWith('c1')
    expect(notifyEventViewers).toHaveBeenCalledWith('e1', 'org-1')
    expect(logSpy).toHaveBeenCalledWith('wsDisconnect: c1')
  })
})
