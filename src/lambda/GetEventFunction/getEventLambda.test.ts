import { jest } from '@jest/globals'

const mockGetConfirmedEvent = jest.fn<any>()
const mockSanitizeDogEvent = jest.fn<any>()

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))

jest.unstable_mockModule('../../lib/event', () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
}))

const { getEventLambda } = await import('./handler')

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

    mockGetConfirmedEvent.mockResolvedValueOnce(rawEvent)
    mockSanitizeDogEvent.mockReturnValueOnce(sanitizedEvent)

    const result = await getEventLambda(event)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(rawEvent)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(sanitizedEvent)
  })

  it('passes through errors from eventReadPort.getConfirmedEvent', async () => {
    const eventId = 'nonexistent'
    const error = new Error('Event not found')
    const missingEvent = {
      ...event,
      pathParameters: { id: eventId },
    }

    mockGetConfirmedEvent.mockRejectedValueOnce(error)

    await expect(getEventLambda(missingEvent)).rejects.toThrow(error)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith(eventId)
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
  })

  it('handles missing event ID parameter', async () => {
    const eventWithoutId = {
      ...event,
      pathParameters: {},
    }

    mockGetConfirmedEvent.mockResolvedValueOnce(undefined)
    mockSanitizeDogEvent.mockReturnValueOnce(undefined)

    const result = await getEventLambda(eventWithoutId)

    expect(mockGetConfirmedEvent).toHaveBeenCalledWith('')
    expect(result.statusCode).toBe(200)
    expect(result.body).toBeUndefined()
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

    mockGetConfirmedEvent.mockResolvedValueOnce(rawEvent)
    mockSanitizeDogEvent.mockReturnValueOnce(sanitizedEvent)

    const result = await getEventLambda(event)

    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(rawEvent)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(sanitizedEvent)
  })
})
