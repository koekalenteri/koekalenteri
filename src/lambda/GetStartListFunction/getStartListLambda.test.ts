import { jest } from '@jest/globals'

const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
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
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 if start list is not available', async () => {
    const eventId = 'event123'
    const confirmedEvent = { id: eventId, startListPublished: false, state: 'draft' }

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
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const registrations = [
      {
        breeder: { name: 'Breeder 1' },
        cancelled: false,
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 2 },
        handler: { name: 'Handler 1' },
        owner: { name: 'Owner 1' },
        ownerHandles: true,
      },
      {
        breeder: { name: 'Breeder 2' },
        cancelled: false,
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 1 },
        handler: { name: 'Handler 2' },
        owner: { name: 'Owner 2' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 3' },
        cancelled: true, // Should be filtered out
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 3 },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 4' },
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        eventId,
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
        ownerHandles: false,
        // No group, should be filtered out
      },
    ]

    const expectedPublicRegs = [
      {
        breeder: 'Breeder 2',
        class: 'ALO',
        dog: { name: 'Dog 2', regNo: 'REG2' },
        group: { date: '2025-01-01', key: 'ALO', number: 1 },
        handler: 'Handler 2',
        owner: 'Owner 2',
        ownerHandles: false,
      },
      {
        breeder: 'Breeder 1',
        class: 'ALO',
        dog: { name: 'Dog 1', regNo: 'REG1' },
        group: { date: '2025-01-01', key: 'ALO', number: 2 },
        handler: 'Handler 1',
        owner: 'Owner 1',
        ownerHandles: true,
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
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
    const registrations = [
      {
        breeder: { name: 'Breeder 3' },
        cancelled: true, // Should be filtered out
        class: 'ALO',
        dog: { name: 'Dog 3', regNo: 'REG3' },
        eventId,
        group: { date: '2025-01-01', key: 'ALO', number: 3 },
        handler: { name: 'Handler 3' },
        owner: { name: 'Owner 3' },
        ownerHandles: false,
      },
      {
        breeder: { name: 'Breeder 4' },
        class: 'ALO',
        dog: { name: 'Dog 4', regNo: 'REG4' },
        eventId,
        handler: { name: 'Handler 4' },
        owner: { name: 'Owner 4' },
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
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }

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
    const confirmedEvent = { id: eventId, startListPublished: true, state: 'invited' }
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
