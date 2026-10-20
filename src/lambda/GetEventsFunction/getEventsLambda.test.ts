import type { APIGatewayProxyEvent } from 'aws-lambda'
import { vi } from 'vitest'
import { answerRejections } from '../test-utils/helpers'

/** The handler's lookback: the cursor trails the newest stamp by this much */
const CURSOR_LOOKBACK_MS = 60 * 1000

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockReadPublicSeasonEvents = vi.fn()
const mockSanitizeDogEvent = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/repositories/eventRepository', () => ({
  readPublicSeasonEvents: mockReadPublicSeasonEvents,
}))

vi.doMock('../../lib/event', async () => ({
  sanitizeDogEvent: mockSanitizeDogEvent,
  storedDayKey: (await vi.importActual<typeof import('../../lib/event')>('../../lib/event')).storedDayKey,
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

  // A test that fails before its own cleanup must not leave a frozen clock or queued answers behind.
  afterEach(() => {
    vi.useRealTimers()
    mockReadPublicSeasonEvents.mockReset()
  })

  it('returns sanitized events', async () => {
    const allEvents = [
      { createdBy: 'user1', id: 'event1', name: 'Event 1', state: 'confirmed' },
      { createdBy: 'user3', id: 'event3', name: 'Event 3', state: 'tentative' },
    ]

    const sanitizedEvent1 = { id: 'event1', name: 'Event 1', state: 'confirmed' }
    const sanitizedEvent3 = { id: 'event3', name: 'Event 3', state: 'tentative' }

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((event: any) => {
      // Remove createdBy field to simulate sanitization
      const { createdBy: _createdBy, ...rest } = event
      return rest
    })

    await getEventsLambda(event)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(2)
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[0])
    expect(mockSanitizeDogEvent).toHaveBeenCalledWith(allEvents[1])
    expect(mockResponse).toHaveBeenCalledWith(200, [sanitizedEvent1, sanitizedEvent3], event)
  })

  it('returns empty array if no events found', async () => {
    mockReadPublicSeasonEvents.mockResolvedValueOnce([])

    await getEventsLambda(event)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('returns empty array if the query returns undefined', async () => {
    mockReadPublicSeasonEvents.mockResolvedValueOnce(undefined)

    await getEventsLambda(event)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  // Drafts are the database's to leave out, not the handler's: the public list never needs them,
  // so they are not read over the wire either (KOE-1341).
  it('leaves drafts out in the query, and reads the current and next season without a range', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockReadPublicSeasonEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await getEventsLambda(event)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalledTimes(2)
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2026', '2027-12-31')
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(2, '2027', expect.any(String))
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)

    vi.useRealTimers()
  })

  // The public list takes `start` from anyone: a year-1 instant reads as no start, not a 500.
  it('reads a start without a calendar day as no start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockReadPublicSeasonEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await getEventsLambda(asEvent({ body: '', headers: {}, queryStringParameters: { start: '-62135596800000' } }))

    expect(mockReadPublicSeasonEvents).toHaveBeenCalledTimes(2)
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2026', expect.any(String))
    expect(mockResponse).toHaveBeenCalledWith(200, [], expect.anything())

    vi.useRealTimers()
  })

  it('passes through errors from the query', async () => {
    const error = new Error('Database error')

    mockReadPublicSeasonEvents.mockRejectedValueOnce(error)

    await expect(getEventsLambda(event)).rejects.toThrow(error)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalled()
    expect(mockSanitizeDogEvent).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('filters events by start date (excludes those ending before start)', async () => {
    // An open-ended range in the current season also reads the next one, so the bounds below hold
    // only while "now" is in 2026.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const allEvents = [
      // ends before the range start -> excluded
      { endDate: '2026-01-01', id: 'event1', startDate: '2026-01-01', state: 'confirmed' },
      // overlaps range start -> included
      { endDate: '2026-01-05', id: 'event2', startDate: '2026-01-02', state: 'confirmed' },
      // no endDate -> treat as same as startDate
      { id: 'event3', startDate: '2026-01-03', state: 'confirmed' },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2026', '2027-12-31')
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(2, '2027', '2027-12-31')
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[1], allEvents[2]], rangeEvent)

    vi.useRealTimers()
  })

  // KOE-1547: the season is read up to the range's last Finnish day as a key, and a row not yet
  // migrated, whose start is the instant its Finnish day starts at, is judged by the same day.
  it('reads a range by its Finnish days, rows stored as keys and as instants alike', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const allEvents = [
      { endDate: '2026-06-01', id: 'key-in', startDate: '2026-06-01', state: 'confirmed' },
      {
        endDate: '2026-05-31T21:00:00.000Z',
        id: 'instant-in',
        startDate: '2026-05-31T21:00:00.000Z',
        state: 'confirmed',
      },
      { endDate: '2026-06-02', id: 'key-out', startDate: '2026-06-02', state: 'confirmed' },
      {
        endDate: '2026-06-01T21:00:00.000Z',
        id: 'instant-out',
        startDate: '2026-06-01T21:00:00.000Z',
        state: 'confirmed',
      },
    ]
    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: unknown) => e)

    // The end of 1.6. in Finland, as a browser asks for it.
    const rangeEvent = asEvent({ ...event, queryStringParameters: { end: '2026-06-01T20:59:59.999Z' } })
    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalledWith('2026', '2026-06-01')
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[0], allEvents[1]], rangeEvent)
  })

  it('accepts ISO string start date query params', async () => {
    const allEvents = [
      { endDate: '2026-01-01', id: 'event1', startDate: '2026-01-01', state: 'confirmed' },
      { endDate: '2026-01-05', id: 'event2', startDate: '2026-01-02', state: 'confirmed' },
      { id: 'event3', startDate: '2026-01-03', state: 'confirmed' },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
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
      { id: 'event1', startDate: '2026-01-01', state: 'confirmed' },
      // starts exactly at end -> included (eventStart > end is false)
      { id: 'event2', startDate: '2026-01-02', state: 'confirmed' },
      // starts after end -> excluded
      { id: 'event3', startDate: '2026-01-03', state: 'confirmed' },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
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
      { endDate: '2026-01-01', id: 'event1', startDate: '2026-01-01', state: 'confirmed' },
      // overlaps -> included
      { endDate: '2026-01-05', id: 'event2', startDate: '2026-01-01', state: 'confirmed' },
      // starts after end -> excluded
      { endDate: '2026-01-11', id: 'event3', startDate: '2026-01-10', state: 'confirmed' },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
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
    const allEvents = [{ id: 'event2', startDate: '2026-01-03', state: 'confirmed' }]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2026-01-03T00:00:00.000Z')),
        start: String(Date.parse('2026-01-03T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenCalledTimes(1)
    expect(mockSanitizeDogEvent).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, [allEvents[0]], rangeEvent)
  })

  it('filters events by since (excludes those modified before since)', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-01',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-02T10:00:00.000Z',
        startDate: '2026-01-02',
        state: 'confirmed',
      },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
    mockSanitizeDogEvent.mockImplementation((e: any) => e)

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        since: String(Date.parse('2026-01-02T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-02T10:00:00.000Z') - CURSOR_LOOKBACK_MS,
        events: [allEvents[1]],
        unchanged: [{ id: 'event1', updatedAt: '2026-01-01T10:00:00.000Z' }],
        unchangedIds: ['event1'],
      },
      rangeEvent
    )
  })

  it('accepts ISO string end and since query params', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-03',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-03T10:00:00.000Z',
        startDate: '2026-01-03',
        state: 'confirmed',
      },
      {
        endDate: '2026-01-10',
        id: 'event3',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-10',
        state: 'confirmed',
      },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
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

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-03T10:00:00.000Z') - CURSOR_LOOKBACK_MS,
        events: [allEvents[1]],
        unchanged: [{ id: 'event1', updatedAt: '2026-01-01T10:00:00.000Z' }],
        unchangedIds: ['event1'],
      },
      rangeEvent
    )
  })

  it('returns unchanged ids only for unchanged in-range events when since is used with range filters', async () => {
    const allEvents = [
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-03',
        state: 'confirmed',
      },
      {
        id: 'event2',
        modifiedAt: '2026-01-03T10:00:00.000Z',
        startDate: '2026-01-03',
        state: 'confirmed',
      },
      {
        endDate: '2026-01-10',
        id: 'event3',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-10',
        state: 'confirmed',
      },
    ]

    mockReadPublicSeasonEvents.mockResolvedValueOnce(allEvents)
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

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: Date.parse('2026-01-03T10:00:00.000Z') - CURSOR_LOOKBACK_MS,
        events: [allEvents[1]],
        unchanged: [{ id: 'event1', updatedAt: '2026-01-01T10:00:00.000Z' }],
        unchangedIds: ['event1'],
      },
      rangeEvent
    )
  })

  it('hands out a cursor that still reaches a row stamped just before the newest one (KOE-1501)', async () => {
    const newest = Date.parse('2026-01-03T10:00:00.000Z')
    mockReadPublicSeasonEvents.mockResolvedValueOnce([
      { id: 'new', modifiedAt: '2026-01-03T10:00:00.000Z', startDate: '2026-01-03', state: 'confirmed' },
    ])
    mockSanitizeDogEvent.mockImplementation((e: unknown) => e)
    const since = Date.parse('2026-01-01T00:00:00.000Z')

    await getEventsLambda(asEvent({ ...event, queryStringParameters: { since: String(since) } }))
    const { cursor } = mockResponse.mock.calls[0][1]

    // A row committed late, stamped 30 s before the newest one seen, is at or after the cursor
    expect(cursor).toBeLessThanOrEqual(newest - 30 * 1000)
  })

  it('keeps the cursor at since when no event in range is newer than it (KOE-1501)', async () => {
    const since = Date.parse('2026-01-05T00:00:00.000Z')
    mockReadPublicSeasonEvents.mockResolvedValueOnce([
      {
        id: 'event1',
        modifiedAt: '2026-01-01T10:00:00.000Z',
        startDate: '2026-01-03',
        state: 'confirmed',
      },
    ])
    mockSanitizeDogEvent.mockImplementation((e: unknown) => e)

    const rangeEvent = asEvent({ ...event, queryStringParameters: { since: String(since) } })

    await getEventsLambda(rangeEvent)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        cursor: since,
        events: [],
        unchanged: [{ id: 'event1', updatedAt: '2026-01-01T10:00:00.000Z' }],
        unchangedIds: ['event1'],
      },
      rangeEvent
    )
  })

  it('queries all derived seasons for cross-year ranges', async () => {
    mockReadPublicSeasonEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        end: String(Date.parse('2027-01-02T00:00:00.000Z')),
        start: String(Date.parse('2026-12-31T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2026', '2027-01-02')
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(2, '2027', '2027-01-02')
  })

  it('queries current and next season for open-ended current-season ranges', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    mockReadPublicSeasonEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-05-01T00:00:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2026', '2027-12-31')
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(2, '2027', '2027-12-31')

    vi.useRealTimers()
  })

  it('uses Helsinki timezone when deciding whether open-ended range is in current season', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T22:30:00.000Z')) // 2027-01-01 in Helsinki
    mockReadPublicSeasonEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const rangeEvent = asEvent({
      ...event,
      queryStringParameters: {
        start: String(Date.parse('2026-12-31T22:30:00.000Z')),
      },
    })

    await getEventsLambda(rangeEvent)

    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(1, '2027', '2028-12-31')
    expect(mockReadPublicSeasonEvents).toHaveBeenNthCalledWith(2, '2028', '2028-12-31')

    vi.useRealTimers()
  })
})
