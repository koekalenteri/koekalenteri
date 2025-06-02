import { jest } from '@jest/globals'

const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockIsStartListAvailable = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../../lib/event', () => ({
  isStartListAvailable: mockIsStartListAvailable,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    query: mockQuery,
  })),
}))

const { default: getStartListLambda } = await import('./handler')

describe('getStartListLambda', () => {
  const event = {
    headers: {},
    body: '',
    pathParameters: { eventId: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 if start list is not available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, state: 'draft', startListPublished: false }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(false)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(404, [], event)
  })

  it('returns 200 with public registrations if start list is available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, state: 'invited', startListPublished: true }
    const registrations = [
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        handler: { name: 'Handler 1' },
        owner: { name: 'Owner 1' },
        breeder: { name: 'Breeder 1' },
        ownerHandles: true,
        group: { key: 'ALO', number: 2, date: '2025-01-01' },
        cancelled: false,
      },
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        handler: { name: 'Handler 2' },
        owner: { name: 'Owner 2' },
        breeder: { name: 'Breeder 2' },
        ownerHandles: false,
        group: { key: 'ALO', number: 1, date: '2025-01-01' },
        cancelled: false,
      },
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        breeder: { name: 'Breeder 3' },
        ownerHandles: false,
        group: { key: 'ALO', number: 3, date: '2025-01-01' },
        cancelled: true, // Should be filtered out
      },
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
        breeder: { name: 'Breeder 4' },
        ownerHandles: false,
        // No group, should be filtered out
      },
    ]

    const expectedPublicRegs = [
      {
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        handler: 'Handler 2',
        owner: 'Owner 2',
        breeder: 'Breeder 2',
        ownerHandles: false,
        group: { key: 'ALO', number: 1, date: '2025-01-01' },
      },
      {
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        handler: 'Handler 1',
        owner: 'Owner 1',
        breeder: 'Breeder 1',
        ownerHandles: true,
        group: { key: 'ALO', number: 2, date: '2025-01-01' },
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, expectedPublicRegs, event)
  })

  it('returns 404 if no registrations match the criteria', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, state: 'invited', startListPublished: true }
    const registrations = [
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        breeder: { name: 'Breeder 3' },
        ownerHandles: false,
        group: { key: 'ALO', number: 3, date: '2025-01-01' },
        cancelled: true, // Should be filtered out
      },
      {
        eventId,
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
        breeder: { name: 'Breeder 4' },
        ownerHandles: false,
        // No group, should be filtered out
      },
    ]

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(registrations)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(404, [], event)
  })

  it('returns 404 if query returns undefined', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, state: 'invited', startListPublished: true }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockResolvedValueOnce(undefined)

    await getStartListLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).toHaveBeenCalledWith(404, [], event)
  })

  it('passes through errors from getEvent', async () => {
    const eventId = 'event123'
    const error = new Error('Event not found')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from query', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, state: 'invited', startListPublished: true }
    const error = new Error('Database error')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(confirmedEvent)
    mockIsStartListAvailable.mockReturnValueOnce(true)
    mockQuery.mockRejectedValueOnce(error)

    await expect(getStartListLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockIsStartListAvailable).toHaveBeenCalledWith(confirmedEvent)
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
