import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockAuthorize = jest.fn<any>()
const mockCreateDbRecord = jest.fn<any>()
const mockWrite = jest.fn<any>()
const mockReadAll = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../utils/proxyEvent', () => ({
  createDbRecord: mockCreateDbRecord,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    write: mockWrite,
    readAll: mockReadAll,
  })),
}))

// Mock Date.toISOString to return a consistent timestamp for testing
const mockTimestamp = '2023-01-01T12:00:00.000Z'
const originalDateToISOString = Date.prototype.toISOString
beforeAll(() => {
  Date.prototype.toISOString = jest.fn(() => mockTimestamp)
})
afterAll(() => {
  Date.prototype.toISOString = originalDateToISOString
})

const { default: putEventTypeLambda } = await import('./handler')

describe('putEventTypeLambda', () => {
  const event = {
    body: JSON.stringify({
      eventType: 'AGILITY',
      name: 'Agility',
      active: true,
    }),
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Default mock implementations
    mockAuthorize.mockResolvedValue({
      id: 'user123',
      name: 'Admin User',
      admin: true,
    })

    mockCreateDbRecord.mockReturnValue({
      eventType: 'AGILITY',
      name: 'Agility',
      active: true,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
    })

    mockWrite.mockResolvedValue(undefined)
    mockReadAll.mockResolvedValue([])
  })

  it('returns 401 if user is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      id: 'user123',
      name: 'Regular User',
      admin: false,
    })

    await putEventTypeLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockCreateDbRecord).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('creates an active event type successfully', async () => {
    const eventTypeItem = {
      eventType: 'AGILITY',
      name: 'Agility',
      active: true,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
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
        eventType: 'AGILITY',
        name: 'Agility',
        active: false,
      }),
    }

    const eventTypeItem = {
      eventType: 'AGILITY',
      name: 'Agility',
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience', active: true }]

    // Setup judges that need to be removed
    const judgesToRemove = [{ id: 'judge1', name: 'Judge One', eventTypes: ['AGILITY'] }]

    // Setup officials that need to be removed
    const officialsToRemove = [{ id: 'official1', name: 'Official One', eventTypes: ['AGILITY'] }]

    // Setup judges that should not be removed
    const judgesToKeep = [{ id: 'judge2', name: 'Judge Two', eventTypes: ['RALLY_OBEDIENCE'] }]

    // Setup officials that should not be removed
    const officialsToKeep = [{ id: 'official2', name: 'Official Two', eventTypes: ['RALLY_OBEDIENCE'] }]

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
        eventType: 'AGILITY',
        name: 'Agility',
        active: false,
      }),
    }

    const eventTypeItem = {
      eventType: 'AGILITY',
      name: 'Agility',
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience', active: true }]

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
        eventType: 'AGILITY',
        name: 'Agility',
        active: false,
      }),
    }

    const eventTypeItem = {
      eventType: 'AGILITY',
      name: 'Agility',
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
    }
    mockCreateDbRecord.mockReturnValueOnce(eventTypeItem)

    // Setup active event types
    const activeEventTypes = [{ eventType: 'RALLY_OBEDIENCE', name: 'Rally Obedience', active: true }]

    // Setup judges that are already deleted
    const deletedJudges = [
      { id: 'judge1', name: 'Judge One', eventTypes: ['AGILITY'], deletedAt: '2022-01-01T00:00:00.000Z' },
    ]

    // Setup officials that are already deleted
    const deletedOfficials = [
      { id: 'official1', name: 'Official One', eventTypes: ['AGILITY'], deletedAt: '2022-01-01T00:00:00.000Z' },
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
        eventType: 'AGILITY',
        name: 'Agility',
        active: false,
      }),
    }

    const eventTypeItem = {
      eventType: 'AGILITY',
      name: 'Agility',
      active: false,
      createdAt: mockTimestamp,
      createdBy: 'Admin User',
      modifiedAt: mockTimestamp,
      modifiedBy: 'Admin User',
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
