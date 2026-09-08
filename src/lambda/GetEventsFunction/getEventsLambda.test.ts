import type { APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockQuery = vi.fn()
const mockSanitizeDogEvent = vi.fn()

vi.doMock('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      query: mockQuery,
    }
  }),
}))

vi.doMock('../../lib/event', () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
}))

const { default: getEventsLambda } = await import('./handler')

/**
 * getEventsLambda reads only headers and queryStringParameters, so the tests build minimal
 * events; they convert to the full APIGatewayProxyEvent at this one named boundary.
 */
const asEvent = (event: {
  body?: string | null
  headers?: Record<string, string | undefined>
  queryStringParameters?: Record<string, string | undefined>
}) => event as APIGatewayProxyEvent

describe('getEventsLambda', () => {
  const event = asEvent({
    body: '',
    headers: {},
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns sanitized events', async () => {
    const allEvents = [
      { createdBy: 'user1', id: 'event1', name: 'Event 1', state: 'confirmed' },
      { createdBy: 'user3', id: 'event3', name: 'Event 3', state: 'tentative' },
    ]

    const sanitizedEvent1 = { id: 'event1', name: 'Event 1', state: 'confirmed' }
    const sanitizedEvent3 = { id: 'event3', name: 'Event 3', state: 'tentative' }

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((event: any) => {
      // Remove createdBy field to simulate sanitization
      const { createdBy: _createdBy, ...rest } = event
      return rest
    })

    await getEventsLambda(event)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(2)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[0])
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[1])
    expect(mockResponse).toHaveBeenCalledWith(200, [sanitizedEvent1, sanitizedEvent3], event)
  })

  it('returns empty array if no events found', async () => {
    mockQuery.mockResolvedValueOnce([])

    await getEventsLambda(event)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns empty array if the query returns undefined', async () => {
    mockQuery.mockResolvedValueOnce(undefined)

    await getEventsLambda(event)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  // Drafts are the database's to leave out, not the handler's: the public list never needs them,
  // so they are not read over the wire either (KOE-1341).
  it('leaves drafts out in the query, and reads the current and next season without a range', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await getEventsLambda(event)

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ values: expect.objectContaining({ ':season': '2027' }) })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)

    vi.useRealTimers()
  })

  it('passes through errors from the query', async () => {
    const error = new Error('Database error')

    mockQuery.mockRejectedValueOnce(error)

    await expect(getEventsLambda(event)).rejects.toThrow(error)

    expect(mockQuery).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
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

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1], allEvents[2]], rangeEvent)
  })

  it('accepts ISO string start date query params', async () => {
    const allEvents = [
      { endDate: '2026-01-01T23:59:59.000Z', id: 'event1', startDate: '2026-01-01T00:00:00.000Z', state: 'confirmed' },
      { endDate: '2026-01-05T00:00:00.000Z', id: 'event2', startDate: '2026-01-02T00:00:00.000Z', state: 'confirmed' },
      { id: 'event3', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' },
    ]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: '2026-01-02T00:00:00.000Z',
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1], allEvents[2]], rangeEvent)
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

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[0], allEvents[1]], rangeEvent)
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

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-06T00:00:00.000Z')),
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1]], rangeEvent)
  })

  it('reads a single-day range from its one season', async () => {
    const allEvents = [{ id: 'event2', startDate: '2026-01-03T00:00:00.000Z', state: 'confirmed' }]

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-03T00:00:00.000Z')),
        start: String(Date.parse('2026-01-03T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[0]], rangeEvent)
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

    mockQuery.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        since: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, { events: [allEvents[1]], unchangedIds: ['event1'] }, rangeEvent)
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

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: '2026-01-05T00:00:00.000Z',
        since: '2026-01-02T00:00:00.000Z',
        start: '2026-01-02T00:00:00.000Z',
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, { events: [allEvents[1]], unchangedIds: ['event1'] }, rangeEvent)
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

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-05T00:00:00.000Z')),
        since: String(Date.parse('2026-01-02T00:00:00.000Z')),
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(200, { events: [allEvents[1]], unchangedIds: ['event1'] }, rangeEvent)
  })

  it('queries all derived seasons for cross-year ranges', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2027-01-02T00:00:00.000Z')),
        start: String(Date.parse('2026-12-31T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-01-02T00:00:00.000Z',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-01-02T00:00:00.000Z',
        ':season': '2027',
      },
    })
  })

  it('queries current and next season for open-ended current-season ranges', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-05-01T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2026',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2027-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })

    vi.useRealTimers()
  })

  it('uses Helsinki timezone when deciding whether open-ended range is in current season', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T22:30:00.000Z')) // 2027-01-01 in Helsinki
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-12-31T22:30:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2028-12-31T23:59:59.999+02:00',
        ':season': '2027',
      },
    })
    expect(mockQuery).toHaveBeenNthCalledWith(2, {
      filterExpression: '#state <> :draft',
      index: 'gsiSeasonStartDate',
      key: 'season = :season AND startDate <= :endDate',
      names: { '#state': 'state' },
      table: expect.anything(),
      values: {
        ':draft': 'draft',
        ':endDate': '2028-12-31T23:59:59.999+02:00',
        ':season': '2028',
      },
    })

    vi.useRealTimers()
  })
})
