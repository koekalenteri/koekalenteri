import { jest } from '@jest/globals'

const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockReadAll = jest.fn<any>()
const mockSanitizeDogEvent = jest.fn<any>()

jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    readAll: mockReadAll,
  })),
}))

jest.unstable_mockModule('../../lib/event', () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
}))

const { default: getEventsLambda } = await import('./handler')

describe('getEventsLambda', () => {
  const event = {
    headers: {},
    body: '',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns sanitized non-draft events', async () => {
    const allEvents = [
      { id: 'event1', state: 'confirmed', name: 'Event 1', createdBy: 'user1' },
      { id: 'event2', state: 'draft', name: 'Event 2', createdBy: 'user2' },
      { id: 'event3', state: 'tentative', name: 'Event 3', createdBy: 'user3' },
    ]

    const sanitizedEvent1 = { id: 'event1', state: 'confirmed', name: 'Event 1' }
    const sanitizedEvent3 = { id: 'event3', state: 'tentative', name: 'Event 3' }

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((event: any) => {
      // Remove createdBy field to simulate sanitization
      const { createdBy, ...rest } = event
      return rest
    })

    await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(2)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[0])
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[2])
    expect(mockResponse).toHaveBeenCalledWith(200, [sanitizedEvent1, sanitizedEvent3], event)
  })

  it('returns empty array if no events found', async () => {
    mockReadAll.mockResolvedValueOnce([])

    await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns undefined if readAll returns undefined', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('filters out all draft events', async () => {
    const allEvents = [
      { id: 'event1', state: 'draft', name: 'Event 1', createdBy: 'user1' },
      { id: 'event2', state: 'draft', name: 'Event 2', createdBy: 'user2' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)

    await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('passes through errors from readAll', async () => {
    const error = new Error('Database error')

    mockReadAll.mockRejectedValueOnce(error)

    await expect(getEventsLambda(event)).rejects.toThrow(error)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
