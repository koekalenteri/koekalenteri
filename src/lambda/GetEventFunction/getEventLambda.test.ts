import { jest } from '@jest/globals'

const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
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
    headers: {},
    body: '',
    pathParameters: { id: 'event123' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('retrieves and returns a sanitized event', async () => {
    const eventId = 'event123'
    const rawEvent = {
      id: eventId,
      name: 'Test Event',
      createdBy: 'user1',
      modifiedBy: 'user2',
      secretary: { id: 'sec1', name: 'Secretary' },
      official: { id: 'off1', name: 'Official' },
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
      id: eventId,
      name: 'Test Event',
      description: 'Event description',
      startDate: '2025-07-01T00:00:00.000Z',
      endDate: '2025-07-02T00:00:00.000Z',
      location: 'Test Location',
      eventType: 'NOME-A',
      organizer: { id: 'org1', name: 'Organizer' },
      classes: [{ class: 'ALO', date: '2025-07-01T00:00:00.000Z' }],
      places: 10,
      cost: 50,
      costMember: 40,
      state: 'confirmed',

      // Fields that should be removed by sanitization
      createdBy: 'user1',
      modifiedBy: 'user2',
      secretary: { id: 'sec1', name: 'Secretary' },
      official: { id: 'off1', name: 'Official' },
    }

    const sanitizedEvent = {
      id: eventId,
      name: 'Test Event',
      description: 'Event description',
      startDate: '2025-07-01T00:00:00.000Z',
      endDate: '2025-07-02T00:00:00.000Z',
      location: 'Test Location',
      eventType: 'NOME-A',
      organizer: { id: 'org1', name: 'Organizer' },
      classes: [{ class: 'ALO', date: '2025-07-01T00:00:00.000Z' }],
      places: 10,
      cost: 50,
      costMember: 40,
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
