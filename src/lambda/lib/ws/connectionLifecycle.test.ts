import { jest } from '@jest/globals'

const mockCreateConnection = jest.fn<any>()
const mockGetConnection = jest.fn<any>()
const mockRemoveConnection = jest.fn<any>()
const mockGetEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  createConnection: mockCreateConnection,
  getConnection: mockGetConnection,
  removeConnection: mockRemoveConnection,
}))

jest.unstable_mockModule('../../lib/event', () => ({
  getEvent: mockGetEvent,
}))

const { connectWebSocket, disconnectWebSocket } = await import('./connectionLifecycle')

describe('ws/connectionLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('connectWebSocket writes connection', async () => {
    await connectWebSocket({ connectionId: 'c1' } as any)
    expect(mockCreateConnection).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('disconnectWebSocket removes and notifies viewers when subscribed', async () => {
    mockGetConnection.mockResolvedValueOnce({ connectionId: 'c1', eventId: 'e1' })
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org-1' } })
    const notifyEventViewers = jest.fn<any>().mockResolvedValue(undefined)

    await disconnectWebSocket('c1', { notifyEventViewers })

    expect(mockRemoveConnection).toHaveBeenCalledWith('c1')
    expect(notifyEventViewers).toHaveBeenCalledWith('e1', 'org-1')
  })
})
