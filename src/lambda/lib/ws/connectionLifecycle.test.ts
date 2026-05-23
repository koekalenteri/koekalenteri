import { jest } from '@jest/globals'

const mockCreateConnection = jest.fn<any>()
const mockAuthenticateConnection = jest.fn<any>()
const mockGetConnection = jest.fn<any>()
const mockRemoveConnection = jest.fn<any>()
const mockGetEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  authenticateConnection: mockAuthenticateConnection,
  createConnection: mockCreateConnection,
  getConnection: mockGetConnection,
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
  })

  afterAll(() => {
    logSpy.mockRestore()
  })

  it('connectWebSocket writes connection', async () => {
    await connectWebSocket({ connectionId: 'c1' } as any)
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1' })
    expect(logSpy).toHaveBeenCalledWith('wsConnect: c1', { connectionId: 'c1' })
  })

  it('authenticateWebSocket updates connection auth metadata', async () => {
    await authenticateWebSocket({ connectionId: 'c1', memberOf: ['org-1'], userId: 'u1' } as any)

    expect(mockAuthenticateConnection).toHaveBeenCalledWith({ connectionId: 'c1', memberOf: ['org-1'], userId: 'u1' })
    expect(logSpy).toHaveBeenCalledWith('wsAuthenticate: c1', {
      admin: undefined,
      connectionId: 'c1',
      expiresAt: undefined,
      memberOf: ['org-1'],
      userId: 'u1',
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
