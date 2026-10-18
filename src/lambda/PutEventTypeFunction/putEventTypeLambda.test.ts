import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockCreateDbRecord = vi.fn()
const mockWriteEventType = vi.fn()
const mockReadEventTypes = vi.fn()
const mockReadJudges = vi.fn()
const mockWriteJudges = vi.fn()
const mockReadOfficials = vi.fn()
const mockWriteOfficials = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: unknown) => {
    const user = await mockAuthorize(event)
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))

vi.doMock('../utils/proxyEvent', () => ({
  createDbRecord: mockCreateDbRecord,
}))

vi.doMock('../lib/repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadEventTypes,
  writeEventType: mockWriteEventType,
}))

vi.doMock('../lib/repositories/judgeRepository', () => ({
  readJudges: mockReadJudges,
  writeJudges: mockWriteJudges,
}))

vi.doMock('../lib/repositories/officialRepository', () => ({
  readOfficials: mockReadOfficials,
  writeOfficials: mockWriteOfficials,
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

    mockWriteEventType.mockResolvedValue(undefined)
    mockReadEventTypes.mockResolvedValue([])
    mockReadJudges.mockResolvedValue([])
    mockWriteJudges.mockResolvedValue(undefined)
    mockReadOfficials.mockResolvedValue([])
    mockWriteOfficials.mockResolvedValue(undefined)
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
    expect(mockWriteEventType).not.toHaveBeenCalled()
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
    expect(mockWriteEventType).toHaveBeenCalledWith(eventTypeItem)

    // Since it's active, we shouldn't need to check for judges/officials to remove
    expect(mockReadEventTypes).not.toHaveBeenCalled()
    expect(mockReadJudges).not.toHaveBeenCalled()
    expect(mockReadOfficials).not.toHaveBeenCalled()

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

    mockReadEventTypes.mockResolvedValueOnce(activeEventTypes)
    mockReadJudges.mockResolvedValueOnce([...judgesToRemove, ...judgesToKeep])
    mockReadOfficials.mockResolvedValueOnce([...officialsToRemove, ...officialsToKeep])

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWriteEventType).toHaveBeenCalledWith(eventTypeItem)

    expect(mockReadEventTypes).toHaveBeenCalledTimes(1)
    expect(mockReadJudges).toHaveBeenCalledTimes(1)
    expect(mockReadOfficials).toHaveBeenCalledTimes(1)

    // Should mark judges without active event types as deleted
    expect(mockWriteJudges).toHaveBeenCalledWith([
      {
        ...judgesToRemove[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
    ])
    expect(mockWriteJudges).toHaveBeenCalledTimes(1)

    // Should mark officials without active event types as deleted
    expect(mockWriteOfficials).toHaveBeenCalledWith([
      {
        ...officialsToRemove[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
    ])
    expect(mockWriteOfficials).toHaveBeenCalledTimes(1)

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

    mockReadEventTypes.mockResolvedValueOnce(activeEventTypes)
    mockReadJudges.mockResolvedValueOnce(judgesWithNoEventTypes)
    mockReadOfficials.mockResolvedValueOnce(officialsWithNoEventTypes)

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWriteEventType).toHaveBeenCalledWith(eventTypeItem)

    expect(mockReadEventTypes).toHaveBeenCalledTimes(1)
    expect(mockReadJudges).toHaveBeenCalledTimes(1)
    expect(mockReadOfficials).toHaveBeenCalledTimes(1)

    // Should mark judges without active event types as deleted
    expect(mockWriteJudges).toHaveBeenCalledWith([
      {
        ...judgesWithNoEventTypes[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
    ])
    expect(mockWriteJudges).toHaveBeenCalledTimes(1)

    // Should mark officials without active event types as deleted
    expect(mockWriteOfficials).toHaveBeenCalledWith([
      {
        ...officialsWithNoEventTypes[0],
        deletedAt: mockTimestamp,
        deletedBy: 'Admin User',
      },
    ])
    expect(mockWriteOfficials).toHaveBeenCalledTimes(1)

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

    mockReadEventTypes.mockResolvedValueOnce(activeEventTypes)
    mockReadJudges.mockResolvedValueOnce(deletedJudges)
    mockReadOfficials.mockResolvedValueOnce(deletedOfficials)

    await putEventTypeLambda(inactiveEvent)

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWriteEventType).toHaveBeenCalledWith(eventTypeItem)

    expect(mockReadEventTypes).toHaveBeenCalledTimes(1)
    expect(mockReadJudges).toHaveBeenCalledTimes(1)
    expect(mockReadOfficials).toHaveBeenCalledTimes(1)

    // Should not mark already deleted judges or officials as deleted again
    expect(mockWriteJudges).not.toHaveBeenCalled()
    expect(mockWriteOfficials).not.toHaveBeenCalled()

    expect(mockResponse).toHaveBeenCalledWith(200, eventTypeItem, inactiveEvent)
  })

  it('throws an error if write fails', async () => {
    const error = new Error('Write error')
    mockWriteEventType.mockRejectedValueOnce(error)

    await expect(putEventTypeLambda(event)).rejects.toThrow('Write error')

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(event, mockTimestamp, 'Admin User', false)
    expect(mockWriteEventType).toHaveBeenCalledTimes(1)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('throws an error if reading the event types fails', async () => {
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
    mockReadEventTypes.mockRejectedValueOnce(error)

    await expect(putEventTypeLambda(inactiveEvent)).rejects.toThrow('Read error')

    expect(mockAuthorize).toHaveBeenCalledWith(inactiveEvent)
    expect(mockCreateDbRecord).toHaveBeenCalledWith(inactiveEvent, mockTimestamp, 'Admin User', false)
    expect(mockWriteEventType).toHaveBeenCalledTimes(1)
    expect(mockReadEventTypes).toHaveBeenCalledTimes(1)
    expect(mockReadJudges).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
