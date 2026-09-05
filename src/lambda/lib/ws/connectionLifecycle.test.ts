import { vi } from 'vitest'
import { loggedLines } from '../../test-utils/logs'

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
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockQueryPublicConnections.mockResolvedValue([])
  })

  afterAll(() => {
    infoSpy.mockRestore()
  })

  it('connectWebSocket writes connection', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-23T19:00:00.000Z'))

    await connectWebSocket({ connectionId: 'c1' })

    expect(mockQueryPublicConnections).toHaveBeenCalledWith()
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1', expiresAt: 1779570000 })
    expect(loggedLines(infoSpy)).toContainEqual(expect.objectContaining({ connectionId: 'c1', message: 'wsConnect' }))
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
})
