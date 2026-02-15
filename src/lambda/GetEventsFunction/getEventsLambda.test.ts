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
      const { createdBy: _createdBy, ...rest } = event
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

  it('returns empty array if readAll returns undefined', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
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

  it('filters events by start date (excludes those ending before start)', async () => {
    const allEvents = [
      // ends before the range start -> excluded
      { id: 'event1', state: 'confirmed', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-01T23:59:59.000Z' },
      // overlaps range start -> included
      { id: 'event2', state: 'confirmed', startDate: '2026-01-02T00:00:00.000Z', endDate: '2026-01-05T00:00:00.000Z' },
      // no endDate -> treat as same as startDate
      { id: 'event3', state: 'confirmed', startDate: '2026-01-03T00:00:00.000Z' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1], allEvents[2]], rangeEvent)
  })

  it('filters events by end date (excludes those starting after end)', async () => {
    const allEvents = [
      // starts before end -> included
      { id: 'event1', state: 'confirmed', startDate: '2026-01-01T00:00:00.000Z' },
      // starts exactly at end -> included (eventStart > end is false)
      { id: 'event2', state: 'confirmed', startDate: '2026-01-02T00:00:00.000Z' },
      // starts after end -> excluded
      { id: 'event3', state: 'confirmed', startDate: '2026-01-03T00:00:00.000Z' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[0], allEvents[1]], rangeEvent)
  })

  it('filters events by both start and end dates (keeps only overlapping)', async () => {
    const allEvents = [
      // ends before start -> excluded
      { id: 'event1', state: 'confirmed', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-01T12:00:00.000Z' },
      // overlaps -> included
      { id: 'event2', state: 'confirmed', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-05T00:00:00.000Z' },
      // starts after end -> excluded
      { id: 'event3', state: 'confirmed', startDate: '2026-01-10T00:00:00.000Z', endDate: '2026-01-11T00:00:00.000Z' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
        end: String(Date.parse('2026-01-06T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1]], rangeEvent)
  })

  it('still excludes draft events before applying date filtering', async () => {
    const allEvents = [
      { id: 'event1', state: 'draft', startDate: '2026-01-03T00:00:00.000Z' },
      { id: 'event2', state: 'confirmed', startDate: '2026-01-03T00:00:00.000Z' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-03T00:00:00.000Z')),
        end: String(Date.parse('2026-01-03T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1]], rangeEvent)
  })

  it('filters events by since (excludes those modified before since)', async () => {
    const allEvents = [
      {
        id: 'event1',
        state: 'confirmed',
        startDate: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'event2',
        state: 'confirmed',
        startDate: '2026-01-02T00:00:00.000Z',
        modifiedAt: '2026-01-02T10:00:00.000Z',
      },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        since: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1]], rangeEvent)
  })
})
