import { jest } from '@jest/globals'

const mockReadAll = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockSanitizeDogEvent = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    query: mockQuery,
    readAll: mockReadAll,
  })),
}))

jest.unstable_mockModule('../../lib/event', () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
}))

const { getEventsLambda } = await import('./handler')

describe('getEventsLambda', () => {
  const event = {
    body: '',
    headers: {},
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns sanitized non-draft events', async () => {
    const allEvents = [
      { createdBy: 'user1', id: 'event1', name: 'Event 1', state: 'confirmed' },
      { createdBy: 'user2', id: 'event2', name: 'Event 2', state: 'draft' },
      { createdBy: 'user3', id: 'event3', name: 'Event 3', state: 'tentative' },
    ]

    const sanitizedEvent1 = { id: 'event1', name: 'Event 1', state: 'confirmed' }
    const sanitizedEvent3 = { id: 'event3', name: 'Event 3', state: 'tentative' }

    mockReadAll.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((event: any) => {
      // Remove createdBy field to simulate sanitization
      const { createdBy: _createdBy, ...rest } = event
      return rest
    })

    const result = await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(2)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[0])
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[2])
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([sanitizedEvent1, sanitizedEvent3])
  })

  it('returns empty array if no events found', async () => {
    mockReadAll.mockResolvedValueOnce([])

    const result = await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([])
  })

  it('returns empty array if readAll returns undefined', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    const result = await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([])
  })

  it('filters out all draft events', async () => {
    const allEvents = [
      { createdBy: 'user1', id: 'event1', name: 'Event 1', state: 'draft' },
      { createdBy: 'user2', id: 'event2', name: 'Event 2', state: 'draft' },
    ]

    mockReadAll.mockResolvedValueOnce(allEvents)

    const result = await getEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([])
  })

  it('passes through errors from readAll', async () => {
    const error = new Error('Database error')

    mockReadAll.mockRejectedValueOnce(error)

    await expect(getEventsLambda(event)).rejects.toThrow(error)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
  })

  it('filters events by start date (excludes those ending before start)', async () => {
    const allEvents = [
      // ends before the range start -> excluded
      { endDate: '2026-01-01T23:59:59.000Z', id: 'event1', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      // overlaps range start -> included
      { endDate: '2026-01-05T00:00:00.000Z', id: 'event2', startDate: '2026-01-02T00:00:00.000Z', state: 'confirmed' },
      // no endDate -> treat as same as startDate
      { id: 'event3', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([allEvents[1], allEvents[2]])
  })

  it('accepts ISO string start date query params', async () => {
    const allEvents = [
      { endDate: '2026-01-01T23:59:59.000Z', id: 'event1', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      { endDate: '2026-01-05T00:00:00.000Z', id: 'event2', startDate: '2026-01-02T00:00:00.000Z', state: 'confirmed' },
      { id: 'event3', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: '2026-01-02T00:00:00.000Z',
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([allEvents[1], allEvents[2]])
  })

  it('filters events by end date (excludes those starting after end)', async () => {
    const allEvents = [
      // starts before end -> included
      { id: 'event1', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      // starts exactly at end -> included (eventStart > end is false)
      { id: 'event2', startDate: '2026-01-02T00:00:00.000Z', state: 'confirmed' },
      // starts after end -> excluded
      { id: 'event3', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([allEvents[0], allEvents[1]])
  })

  it('filters events by both start and end dates (keeps only overlapping)', async () => {
    const allEvents = [
      // ends before start -> excluded
      { endDate: '2026-01-01T12:00:00.000Z', id: 'event1', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      // overlaps -> included
      { endDate: '2026-01-05T00:00:00.000Z', id: 'event2', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      // starts after end -> excluded
      { endDate: '2026-01-11T00:00:00.000Z', id: 'event3', startDate: '2026-01-10T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-06T00:00:00.000Z')),
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([allEvents[1]])
  })

  it('still excludes draft events before applying date filtering', async () => {
    const allEvents = [
      { id: 'event1', startDate: '2026-01-03T00:00:00.000Z', state: 'draft' },
      { id: 'event2', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-03T00:00:00.000Z')),
        start: String(Date.parse('2026-01-03T00:00:00.000Z')),
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(1)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([allEvents[1]])
  })

  it('filters events by since (excludes those modified before since)', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-01T00:00:00.000Z',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-02T10:00:00.000Z',
        startDate: '2026-01-02T00:00:00.000Z',
        state: 'confirmed',
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

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ events: [allEvents[1]], unchangedIds: ['event1'] })
  })

  it('accepts ISO string end and since query params', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-03T00:00:00.000Z',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-03T10:00:00.000Z',
        startDate: '2026-01-03T00:00:00.000Z',
        state: 'confirmed',
      },
      {
        endDate: '2026-01-10T00:00:00.000Z',
        id: 'event3',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-10T00:00:00.000Z',
        state: 'confirmed',
      },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: '2026-01-05T00:00:00.000Z',
        since: '2026-01-02T00:00:00.000Z',
        start: '2026-01-02T00:00:00.000Z',
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ events: [allEvents[1]], unchangedIds: ['event1'] })
  })

  it('returns unchanged ids only for unchanged in-range events when since is used with range filters', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-03T00:00:00.000Z',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-03T10:00:00.000Z',
        startDate: '2026-01-03T00:00:00.000Z',
        state: 'confirmed',
      },
      {
        endDate: '2026-01-10T00:00:00.000Z',
        id: 'event3',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-10T00:00:00.000Z',
        state: 'confirmed',
      },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-05T00:00:00.000Z')),
        since: String(Date.parse('2026-01-02T00:00:00.000Z')),
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    } as any

    const result = await getEventsLambda(rangeEvent)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ events: [allEvents[1]], unchangedIds: ['event1'] })
  })

  it('queries all derived seasons for cross-year ranges', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2027-01-02T00:00:00.000Z')),
        start: String(Date.parse('2026-12-31T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-01-02T00:00:00.000Z',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-01-02T00:00:00.000Z',
        ':season': '2027',
      },
    })
  })

  it('queries current and next season for open-ended current-season ranges', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-05-01T00:00:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })

    jest.useRealTimers()
  })

  it('uses Helsinki timezone when deciding whether open-ended range is in current season', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-12-31T22:30:00.000Z')) // 2027-01-01 in Helsinki
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = {
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-12-31T22:30:00.000Z')),
      },
    } as any

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2028-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      table: expect.anything(),
      values: {
        ':endDate': '2028-12-31T23:59:59.999+02:00',
        ':season': '2028',
      },
    })

    jest.useRealTimers()
  })
})
