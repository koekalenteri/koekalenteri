import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockCreateDbRecord = vi.fn()
const mockWrite = vi.fn()
const mockReadAll = vi.fn()

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) return { res: mockResponse(401, 'Unauthorized', event) ?? { statusCode: 401 } }
    if (!user.admin) return { res: mockResponse(403, 'Forbidden', event) ?? { statusCode: 403 }, user }
    return { user }
  },
}))

vi.doMock('../utils/proxyEvent', () => ({
  createDbRecord: mockCreateDbRecord,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      readAll: mockReadAll,
      write: mockWrite,
    }
  }),
}))

// Mock Date.toISOString to return a consistent timestamp for testing
const mockTimestamp = '2023-01-01T12:00:00.000Z'
const originalDateToISOString = Date.prototype.toISOString
beforeAll(() => {
  Date.prototype.toISOString = vi.fn(() => mockTimestamp)
})
afterAll(() => {
  Date.prototype.toISOString = originalDateToISOString
})

const { default: putEventTypeLambda } = await import('./handler')

describe('putEventTypeLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: JSON.stringify({
      active: true,
      eventType: 'AGILITY',
      name: 'Agility',
    }),
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Admin User',
    })

    mockCreateDbRecord.mockReturnValue({
      active: true,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    })

    mockWrite.mockResolvedValue(undefined)
    mockReadAll.mockResolvedValue([])
  })

  it('returns 403 if user is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Regular User',
    })

    await putEventTypeLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockCreateDbRecord).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('creates an active event type successfully', async () => {
    const eventTypeItem = {
      active: true,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    await putEventTypeLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(event, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledWith(eventTypeItem)

    // Since it's active, we shouldn't need to check for judges/officials to remove
    expect(mockReadAll).not.toHaveBeenCalled()

    expect(mockResponse).toHaveBeenCalledWith(200, eventTypeItem, event)
  })

  it('creates an inactive event type and removes affected judges and officials', async () => {
    // Setup an inactive event type
    const inactiveEvent = {
      ...event,
      body: JSON.stringify({
        active: false,
        eventType: 'AGILITY',
        name: 'Agility',
      }),
    }

    const eventTypeItem = {
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ active: true, eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience' }]

    // Setup judges that need to be removed
    const judgesToRemove = [{ eventTypes: ['AGILITY'], id: 'judge1', name: 'Judge One' }]

    // Setup officials that need to be removed
    const officialsToRemove = [{ eventTypes: ['AGILITY'], id: 'official1', name: 'Official One' }]

    // Setup judges that should not be removed
    const judgesToKeep = [{ eventTypes: ['RALLY_OBEDIENCE'], id: 'judge2', name: 'Judge Two' }]

    // Setup officials that should not be removed
    const officialsToKeep = [{ eventTypes: ['RALLY_OBEDIENCE'], id: 'official2', name: 'Official Two' }]

    // Mock readAll to return different values for different calls
    mockReadAll
      .mockResolvedValueOnce(activeEventTypes) // First call for active event types
      .mockResolvedValueOnce([...judgesToRemove, ...judgesToKeep]) // Second call for judges
      .mockResolvedValueOnce([...officialsToRemove, ...officialsToKeep]) // Third call for officials

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledWith(eventTypeItem)

    // Should check for active event types
    expect(mockReadAll).toHaveBeenCalledTimes(3)

    // Should mark judges without active event types as deleted
    expect(mockWrite).toHaveBeenCalledWith(
      {
        ...judgesToRemove[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
      expect.any(String)
    )

    // Should mark officials without active event types as deleted
    expect(mockWrite).toHaveBeenCalledWith(
      {
        ...officialsToRemove[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
      expect.any(String)
    )

    expect(mockResponse).toHaveBeenCalledWith(200, eventTypeItem, inactiveEvent)
  })

  it('handles judges and officials with no eventTypes property', async () => {
    // Setup an inactive event type
    const inactiveEvent = {
      ...event,
      body: JSON.stringify({
        active: false,
        eventType: 'AGILITY',
        name: 'Agility',
      }),
    }

    const eventTypeItem = {
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ active: true, eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience' }]

    // Setup judges with no eventTypes property
    const judgesWithNoEventTypes = [
      { id: 'judge1', name: 'Judge One' }, // No eventTypes property
    ]

    // Setup officials with no eventTypes property
    const officialsWithNoEventTypes = [
      { id: 'official1', name: 'Official One' }, // No eventTypes property
    ]

    // Mock readAll to return different values for different calls
    mockReadAll
      .mockResolvedValueOnce(activeEventTypes) // First call for active event types
      .mockResolvedValueOnce(judgesWithNoEventTypes) // Second call for judges
      .mockResolvedValueOnce(officialsWithNoEventTypes) // Third call for officials

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledWith(eventTypeItem)

    // Should check for active event types
    expect(mockReadAll).toHaveBeenCalledTimes(3)

    // Should mark judges without active event types as deleted
    expect(mockWrite).toHaveBeenCalledWith(
      {
        ...judgesWithNoEventTypes[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
      expect.any(String)
    )

    // Should mark officials without active event types as deleted
    expect(mockWrite).toHaveBeenCalledWith(
      {
        ...officialsWithNoEventTypes[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
      expect.any(String)
    )

    expect(mockResponse).toHaveBeenCalledWith(200, eventTypeItem, inactiveEvent)
  })

  it('handles judges and officials that are already deleted', async () => {
    // Setup an inactive event type
    const inactiveEvent = {
      ...event,
      body: JSON.stringify({
        active: false,
        eventType: 'AGILITY',
        name: 'Agility',
      }),
    }

    const eventTypeItem = {
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ active: true, eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience' }]

    // Setup judges that are already deleted
    const deletedJudges = [
      { deletedAt: '2022-01-01T00:00:00.000Z', eventTypes: ['AGILITY'], id: 'judge1', name: 'Judge One' },
    ]

    // Setup officials that are already deleted
    const deletedOfficials = [
      { deletedAt: '2022-01-01T00:00:00.000Z', eventTypes: ['AGILITY'], id: 'official1', name: 'Official One' },
    ]

    // Mock readAll to return different values for different calls
    mockReadAll
      .mockResolvedValueOnce(activeEventTypes) // First call for active event types
      .mockResolvedValueOnce(deletedJudges) // Second call for judges
      .mockResolvedValueOnce(deletedOfficials) // Third call for officials

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledWith(eventTypeItem)

    // Should check for active event types
    expect(mockReadAll).toHaveBeenCalledTimes(3)

    // Should not mark already deleted judges as deleted again
    expect(mockWrite).toHaveBeenCalledTimes(1) // Only the event type write

    expect(mockResponse).toHaveBeenCalledWith(200, eventTypeItem, inactiveEvent)
  })

  it('throws an error if write fails', async () => {
    const error = new Error('Write error')
    mockWrite.mockRejectedValueOnce(error)

    await expect(putEventTypeLambda(event)).rejects.toThrow('Write error')

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(event, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('throws an error if readAll fails', async () => {
    // Setup an inactive event type
    const inactiveEvent = {
      ...event,
      body: JSON.stringify({
        active: false,
        eventType: 'AGILITY',
        name: 'Agility',
      }),
    }

    const eventTypeItem = {
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      eventType: 'AGILITY',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
      name: 'Agility',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    const error = new Error('Read error')
    mockReadAll.mockRejectedValueOnce(error)

    await expect(putEventTypeLambda(inactiveEvent)).rejects.toThrow('Read error')

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWrite).toHaveBeenCalledTimes(1)
    expect(mockReadAll).toHaveBeenCalledTimes(1)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
