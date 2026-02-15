import { jest } from '@jest/globals'

const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockGetEvent = jest.fn<any>()
const mockSanitizeDogEvent = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

jest.unstable_mockModule('../../lib/event', () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
}))

const { default: getEventLambda } = await import('./handler')

describe('getEventLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { id: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('retrieves and returns a sanitized event', async () => {
    const eventId = 'event123'
    const rawEvent = {
      createdBy: 'user1',
      id: eventId,
      modifiedBy: 'user2',
      name: 'Test Event',
      official: { id: 'off1', name: 'Official' },
      secretary: { id: 'sec1', name: 'Secretary' },
      // other fields...
    }

    const sanitizedEvent = {
      id: eventId,
      name: 'Test Event',
      // sanitized fields...
    }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(rawEvent)
    mockSanitizeDogEvent.mockReturnValueOnce(sanitizedEvent)

    await getEventLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(rawEvent)
    expect(mockResponse).toHaveBeenCalledWith(200, sanitizedEvent, event)
  })

  it('passes through errors from getEvent', async () => {
    const eventId = 'nonexistent'
    const error = new Error('Event not found')

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockRejectedValueOnce(error)

    await expect(getEventLambda(event)).rejects.toThrow(error)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(eventId)
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('handles missing event ID parameter', async () => {
    mockGetParam.mockReturnValueOnce(undefined)

    await getEventLambda(event)

    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetEvent).toHaveBeenCalledWith(undefined)
    // The function will still try to get the event with undefined ID
    // and the error handling will be done in the getEvent function
  })

  it('preserves all public fields after sanitization', async () => {
    const eventId = 'event123'
    const rawEvent = {
      classes: [{ class: 'ALO', date: '2025-07-01T00:00:00.000Z' }],
      cost: 50,
      costMember: 40,

      // Fields that should be removed by sanitization
      createdBy: 'user1',
      description: 'Event description',
      endDate: '2025-07-02T00:00:00.000Z',
      eventType: 'NOME-A',
      id: eventId,
      location: 'Test Location',
      modifiedBy: 'user2',
      name: 'Test Event',
      official: { id: 'off1', name: 'Official' },
      organizer: { id: 'org1', name: 'Organizer' },
      places: 10,
      secretary: { id: 'sec1', name: 'Secretary' },
      startDate: '2025-07-01T00:00:00.000Z',
      state: 'confirmed',
    }

    const sanitizedEvent = {
      classes: [{ class: 'ALO', date: '2025-07-01T00:00:00.000Z' }],
      cost: 50,
      costMember: 40,
      description: 'Event description',
      endDate: '2025-07-02T00:00:00.000Z',
      eventType: 'NOME-A',
      id: eventId,
      location: 'Test Location',
      name: 'Test Event',
      organizer: { id: 'org1', name: 'Organizer' },
      places: 10,
      startDate: '2025-07-01T00:00:00.000Z',
      state: 'confirmed',
    }

    mockGetParam.mockReturnValueOnce(eventId)
    mockGetEvent.mockResolvedValueOnce(rawEvent)
    mockSanitizeDogEvent.mockReturnValueOnce(sanitizedEvent)

    await getEventLambda(event)

    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(rawEvent)
    expect(mockResponse).toHaveBeenCalledWith(200, sanitizedEvent, event)
  })
})
