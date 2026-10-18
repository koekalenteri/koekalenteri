import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockAuthorize = vi.fn()
const mockAuthorizeEvent = vi.fn()
const mockGetEvent = vi.fn()
const mockSaveEvent = vi.fn(async (event: { id?: string; organizer?: { id?: string } }) => ({
  audience: 'public' as const,
  organizerId: event.organizer?.id ?? '',
  patch: { ...event, eventId: event.id ?? '' },
}))
const mockNanoid = vi.fn()
const mockWrite = vi.fn()
const mockBatchWrite = vi.fn()
const mockResponse = vi.fn()
const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))

vi.doMock('../lib/eventAuth', () => ({
  authorizeEvent: mockAuthorizeEvent,
}))
vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
  saveEvent: mockSaveEvent,
}))
const mockPublishEventChange = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishEventChange: mockPublishEventChange,
}))
vi.doMock('nanoid', () => ({
  nanoid: mockNanoid,
}))
vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {
    constructor(
      public statusCode: number,
      message: string
    ) {
      super(message)
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))
const mockQuery = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      batchWrite: mockBatchWrite,
      query: mockQuery,
      write: mockWrite,
    }
  }),
}))

const { default: copyEventHandler } = await import('./handler')

describe('copyEventHandler', () => {
  const event = constructPartialAPIGwEvent({ body: '{}' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockResolvedValue([])
    mockAuthorizeEvent.mockImplementation(async (_event: unknown, eventId: string) => ({
      item: await mockGetEvent(eventId),
      user: { name: 'Test User' },
    }))
  })

  it('returns 401 if not authorized', async () => {
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockAuthorizeEvent.mockRejectedValueOnce(httpError(401, 'Unauthorized'))
    await copyEventHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
  })

  it('does not copy an event when organizer authorization fails', async () => {
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockAuthorizeEvent.mockRejectedValueOnce(httpError(403, 'Forbidden'))

    await copyEventHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)

    expect(mockSaveEvent).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
    expect(mockBatchWrite).not.toHaveBeenCalled()
  })

  it.each(['not-a-date', '0001-01-01T00:00:00.000Z'])(
    'rejects an invalid copy start date %s before reading the source event',
    async (startDate) => {
      mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
      setEventBody(event, { id: 'event123', startDate })

      await copyEventHandler(event)

      expect(mockResponse).toHaveBeenCalledWith(400, { message: 'Bad request: startDate must be a valid date' }, event)
      expect(mockGetEvent).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['startDate', 'not-a-date'],
    ['endDate', 'not-a-date'],
    ['startDate', '0001-01-01T00:00:00.000Z'],
    ['endDate', '0001-01-01T00:00:00.000Z'],
  ] as const)('rejects an invalid source event %s (%s) before saving', async (field, value) => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2025-06-12T00:00:00.000Z',
      id: 'event123',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
      [field]: value,
    })

    await copyEventHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(400, { message: 'Bad request: source event dates must be valid' }, event)
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('copies event and returns 200 on success', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      endDate: '2025-06-12T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      entryStartDate: '2025-06-01T00:00:00.000Z',
      id: 'event123',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
      name: 'Original Event',
      registrationGroupsLock: { expiresAt: 1, token: 'lock' },
      registrationPaymentsLock: { expiresAt: 1, token: 'lock' },
      startDate: '2025-06-10T00:00:00.000Z',
      state: 'published',
      turns: [{ id: 'turn-1' }],
    }
    mockAuthorize.mockResolvedValueOnce(user)
    setEventBody(event, input)
    mockGetEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')

    const now = new Date('2025-06-02T12:00:00.000Z')
    vi.useFakeTimers().setSystemTime(now)

    await copyEventHandler(event)

    expect(mockSaveEvent).toHaveBeenCalledWith({
      classes: [
        {
          date: '2025-07-01T00:00:00.000Z',
        },
      ],
      createdAt: now.toISOString(),
      createdBy: user.name,
      endDate: '2025-07-03T00:00:00.000Z',
      entryEndDate: '2025-06-26T00:00:00.000Z',
      entryStartDate: '2025-06-22T00:00:00.000Z',
      id: 'newid123',
      modifiedAt: now.toISOString(),
      modifiedBy: user.name,
      name: 'Kopio - Original Event',
      season: '2025',
      startDate: '2025-07-01T00:00:00.000Z',
      // Publish decisions belong to the source event's runs, not the copy.
      startListPublished: false,
      startNumbersPublished: false,
      state: 'draft',
    })

    expect(mockResponse).toHaveBeenCalled()

    vi.useRealTimers()
  })

  // Finnish midnights as stored instants: 21:00Z in summer time, 22:00Z in winter time (KOE-1540).
  it.each([
    {
      expected: {
        days: ['2026-10-31', '2026-11-01'],
        endDate: '2026-10-31T22:00:00.000Z',
        entryEndDate: '2026-10-17T21:00:00.000Z',
        entryStartDate: '2026-09-30T21:00:00.000Z',
        groupDate: '2026-10-31T22:00:00.000Z',
        groupKey: '2026-11-01-ip',
        startDate: '2026-10-30T22:00:00.000Z',
      },
      name: 'summer time to winter time',
      requested: '2026-10-30T22:00:00.000Z',
      source: {
        days: ['2026-05-15', '2026-05-16'],
        endDate: '2026-05-15T21:00:00.000Z',
        entryEndDate: '2026-05-01T21:00:00.000Z',
        entryStartDate: '2026-04-14T21:00:00.000Z',
        groupDate: '2026-05-15T21:00:00.000Z',
        groupKey: '2026-05-16-ip',
        startDate: '2026-05-14T21:00:00.000Z',
      },
    },
    {
      expected: {
        days: ['2026-05-16', '2026-05-17'],
        endDate: '2026-05-16T21:00:00.000Z',
        entryEndDate: '2026-05-01T21:00:00.000Z',
        entryStartDate: '2026-04-14T21:00:00.000Z',
        groupDate: '2026-05-16T21:00:00.000Z',
        groupKey: '2026-05-17-ip',
        startDate: '2026-05-15T21:00:00.000Z',
      },
      name: 'winter time to summer time',
      requested: '2026-05-15T21:00:00.000Z',
      source: {
        days: ['2026-02-15', '2026-02-16'],
        endDate: '2026-02-15T22:00:00.000Z',
        entryEndDate: '2026-01-31T22:00:00.000Z',
        entryStartDate: '2026-01-14T22:00:00.000Z',
        groupDate: '2026-02-15T22:00:00.000Z',
        groupKey: '2026-02-16-ip',
        startDate: '2026-02-14T22:00:00.000Z',
      },
    },
    {
      // The source itself spans the change of 29.3.2026: 27.3. is +02:00 and 30.3. is +03:00.
      expected: {
        days: ['2026-06-12', '2026-06-15'],
        endDate: '2026-06-14T21:00:00.000Z',
        entryEndDate: '2026-04-30T21:00:00.000Z',
        entryStartDate: '2026-04-13T21:00:00.000Z',
        groupDate: '2026-06-14T21:00:00.000Z',
        groupKey: '2026-06-15-ip',
        startDate: '2026-06-11T21:00:00.000Z',
      },
      name: 'a multi-day event across the change of time',
      requested: '2026-06-11T21:00:00.000Z',
      source: {
        days: ['2026-03-27', '2026-03-30'],
        endDate: '2026-03-29T21:00:00.000Z',
        entryEndDate: '2026-02-12T22:00:00.000Z',
        entryStartDate: '2026-01-26T22:00:00.000Z',
        groupDate: '2026-03-29T21:00:00.000Z',
        groupKey: '2026-03-30-ip',
        startDate: '2026-03-26T22:00:00.000Z',
      },
    },
    {
      expected: {
        days: ['2026-03-27', '2026-03-30'],
        endDate: '2026-03-29T21:00:00.000Z',
        entryEndDate: '2026-02-12T22:00:00.000Z',
        entryStartDate: '2026-01-26T22:00:00.000Z',
        groupDate: '2026-03-29T21:00:00.000Z',
        groupKey: '2026-03-30-ip',
        startDate: '2026-03-26T22:00:00.000Z',
      },
      name: 'a copy to the same day',
      requested: '2026-03-26T22:00:00.000Z',
      source: {
        days: ['2026-03-27', '2026-03-30'],
        endDate: '2026-03-29T21:00:00.000Z',
        entryEndDate: '2026-02-12T22:00:00.000Z',
        entryStartDate: '2026-01-26T22:00:00.000Z',
        groupDate: '2026-03-29T21:00:00.000Z',
        groupKey: '2026-03-30-ip',
        startDate: '2026-03-26T22:00:00.000Z',
      },
    },
  ])('moves every date by Finnish calendar days: $name (KOE-1540)', async ({ expected, requested, source }) => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
    setEventBody(event, { id: 'event123', startDate: requested })
    mockGetEvent.mockResolvedValueOnce({
      classes: [{ date: source.startDate }, { date: source.endDate }],
      dates: [
        { date: source.startDate, time: 'ap' },
        { date: source.endDate, time: 'ip' },
      ],
      endDate: source.endDate,
      entryEndDate: source.entryEndDate,
      entryStartDate: source.entryStartDate,
      id: 'event123',
      name: 'Original Event',
      placesPerDay: { [source.days[0]]: 10, [source.days[1]]: 15, 'not-a-day': 3 },
      startDate: source.startDate,
      stations: [
        { date: source.startDate, id: 'post-1', number: 1, tasks: 1 },
        { date: source.endDate, id: 'post-2', number: 1, tasks: 1 },
      ],
    })
    mockNanoid.mockReturnValueOnce('newid123')
    mockQuery.mockResolvedValueOnce([
      {
        dates: [{ date: source.startDate }, { date: source.endDate }],
        eventId: 'event123',
        group: { date: source.groupDate, key: source.groupKey, number: 1, time: 'ip' },
        id: 'registration123',
      },
    ])

    await copyEventHandler(event)

    expect(mockSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        classes: [{ date: expected.startDate }, { date: expected.endDate }],
        dates: [
          { date: expected.startDate, time: 'ap' },
          { date: expected.endDate, time: 'ip' },
        ],
        endDate: expected.endDate,
        entryEndDate: expected.entryEndDate,
        entryStartDate: expected.entryStartDate,
        // The places per day move with their days; a key that is not a day has no day to move to.
        placesPerDay: { [expected.days[0]]: 10, [expected.days[1]]: 15 },
        startDate: expected.startDate,
        // Each post moves to the copy's day that corresponds to its own (KOE-1563).
        stations: [
          { date: expected.startDate, id: 'post-1', number: 1, tasks: 1 },
          { date: expected.endDate, id: 'post-2', number: 1, tasks: 1 },
        ],
      })
    )
    expect(mockBatchWrite).toHaveBeenCalledWith(
      [
        {
          dates: [{ date: expected.startDate }, { date: expected.endDate }],
          eventId: 'newid123',
          group: { date: expected.groupDate, key: expected.groupKey, number: 1, time: 'ip' },
          id: 'registration123',
        },
      ],
      'registration-table-not-found-in-env'
    )
  })

  it('sets season using Finnish timezone when copying an event near year boundary', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2024-12-31T22:00:00.000Z' }
    const originalEvent = {
      classes: [{ date: '2024-12-30T22:00:00.000Z' }],
      createdAt: '2024-12-01T00:00:00.000Z',
      createdBy: 'Someone',
      endDate: '2024-12-30T22:00:00.000Z',
      id: 'event123',
      modifiedAt: '2024-12-01T00:00:00.000Z',
      modifiedBy: 'Someone',
      name: 'Original Event',
      startDate: '2024-12-30T22:00:00.000Z',
      state: 'published',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    setEventBody(event, input)
    mockGetEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')

    await copyEventHandler(event)

    expect(mockSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        season: '2025',
        startDate: '2024-12-31T22:00:00.000Z',
      })
    )
  })

  it('does not carry the link to a Kennelliitto trial, the old kcId included, into the copy (KOE-1534)', async () => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2025-06-12T00:00:00.000Z',
      id: 'event123',
      kcEvent: { classes: [], endDate: '2025-06-12', eventType: 'NOU', location: 'Laukaa', startDate: '2025-06-10' },
      kcGuid: '2b81e6a1-559b-407c-87c7-b8a9b89b1987',
      kcId: 451859,
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
    })
    mockNanoid.mockReturnValueOnce('newid123')

    await copyEventHandler(event)

    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcEvent: expect.anything() }))
    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcGuid: expect.anything() }))
    expect(mockSaveEvent).toHaveBeenCalledWith(expect.not.objectContaining({ kcId: expect.anything() }))
  })

  it('does not copy registration idempotency credentials, post-processing state or event outcomes', async () => {
    const user = { name: 'Test User' }
    mockAuthorize.mockResolvedValueOnce(user)
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2025-06-12T00:00:00.000Z',
      id: 'event123',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
    })
    mockNanoid.mockReturnValueOnce('newid123')
    mockQuery.mockResolvedValueOnce([
      {
        creationIdempotencyKey: 'source-secret',
        dates: [{ date: '2025-06-10T00:00:00.000Z' }],
        eventId: 'event123',
        // What the dog did at the source event stays there: a copy has not run.
        eventResult: { result: 'AVO1', updatedAt: '2025-06-12T00:00:00.000Z', updatedBy: 'Sihteeri' },
        id: 'registration123',
        kcResult: { at: '2025-06-12T01:00:00.000Z', by: 'Sihteeri', status: 'sent', tulosId: 3 },
        newRegistrationAuditAt: '2025-06-01T00:00:00.000Z',
        newRegistrationEmailSentAt: '2025-06-01T00:00:00.000Z',
        newRegistrationLease: { expiresAt: 123, token: 'source-lease' },
        newRegistrationProcessedAt: '2025-06-01T00:00:00.000Z',
        newRegistrationPublishedAt: '2025-06-01T00:00:00.000Z',
        newRegistrationStatsAt: '2025-06-01T00:00:00.000Z',
        startGroup: { date: '2025-06-10T00:00:00.000Z', key: 'AVO-AP', number: 5, time: 'ap' },
      },
    ])

    await copyEventHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith(
      [
        {
          dates: [{ date: '2025-07-01T00:00:00.000Z' }],
          eventId: 'newid123',
          id: 'registration123',
        },
      ],
      'registration-table-not-found-in-env'
    )
  })

  it('shifts the group date of every entry and gives a participant group key only to a start (KOE-1537)', async () => {
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2025-06-12T00:00:00.000Z',
      id: 'event123',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
    })
    mockNanoid.mockReturnValueOnce('newid123')
    mockQuery.mockResolvedValueOnce([
      {
        dates: [{ date: '2025-06-10T00:00:00.000Z', time: 'kp' }],
        eventId: 'event123',
        group: { date: '2025-06-10T00:00:00.000Z', key: '2025-06-10-kp', number: 1, time: 'kp' },
        id: 'starter',
      },
      {
        cancelled: true,
        dates: [{ date: '2025-06-10T00:00:00.000Z', time: 'kp' }],
        eventId: 'event123',
        group: { date: '2025-06-10T00:00:00.000Z', key: 'cancelled', number: 2, time: 'kp' },
        id: 'cancelled',
      },
      {
        // The legacy state: cancelled, but the key still names the source's day.
        cancelled: true,
        dates: [{ date: '2025-06-10T00:00:00.000Z', time: 'kp' }],
        eventId: 'event123',
        group: { date: '2025-06-10T00:00:00.000Z', key: '2025-06-10-kp', number: 3, time: 'kp' },
        id: 'legacy-cancelled',
      },
      {
        dates: [{ date: '2025-06-10T00:00:00.000Z', time: 'kp' }],
        eventId: 'event123',
        group: { date: '2025-06-10T00:00:00.000Z', key: 'reserve', number: 1, time: 'kp' },
        id: 'reserve',
      },
    ])

    await copyEventHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith(
      [
        {
          dates: [{ date: '2025-07-01T00:00:00.000Z', time: 'kp' }],
          eventId: 'newid123',
          group: { date: '2025-07-01T00:00:00.000Z', key: '2025-07-01-kp', number: 1, time: 'kp' },
          id: 'starter',
        },
        {
          cancelled: true,
          dates: [{ date: '2025-07-01T00:00:00.000Z', time: 'kp' }],
          eventId: 'newid123',
          group: { date: '2025-07-01T00:00:00.000Z', key: 'cancelled', number: 2, time: 'kp' },
          id: 'cancelled',
        },
        {
          cancelled: true,
          dates: [{ date: '2025-07-01T00:00:00.000Z', time: 'kp' }],
          eventId: 'newid123',
          group: { date: '2025-07-01T00:00:00.000Z', key: 'cancelled', number: 3, time: 'kp' },
          id: 'legacy-cancelled',
        },
        {
          dates: [{ date: '2025-07-01T00:00:00.000Z', time: 'kp' }],
          eventId: 'newid123',
          group: { date: '2025-07-01T00:00:00.000Z', key: 'reserve', number: 1, time: 'kp' },
          id: 'reserve',
        },
      ],
      'registration-table-not-found-in-env'
    )
  })

  it("keys a copied start by the trial's day in Finnish time, not the UTC day (KOE-1537)", async () => {
    setEventBody(event, { id: 'event123', startDate: '2026-08-21T21:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2026-08-14T21:00:00.000Z',
      id: 'event123',
      name: 'Original Event',
      startDate: '2026-08-14T21:00:00.000Z',
    })
    mockNanoid.mockReturnValueOnce('newid123')
    mockQuery.mockResolvedValueOnce([
      {
        dates: [{ date: '2026-08-14T21:00:00.000Z', time: 'ap' }],
        eventId: 'event123',
        // 21:00Z on the 14th is the morning of the 15th in Finland.
        group: { date: '2026-08-14T21:00:00.000Z', key: '2026-08-15-ap', number: 1, time: 'ap' },
        id: 'starter',
      },
    ])

    await copyEventHandler(event)

    expect(mockBatchWrite).toHaveBeenCalledWith(
      [
        {
          dates: [{ date: '2026-08-21T21:00:00.000Z', time: 'ap' }],
          eventId: 'newid123',
          group: { date: '2026-08-21T21:00:00.000Z', key: '2026-08-22-ap', number: 1, time: 'ap' },
          id: 'starter',
        },
      ],
      'registration-table-not-found-in-env'
    )
  })

  it('returns 500 if getEvent throws', async () => {
    const user = { name: 'Test User' }
    mockAuthorize.mockResolvedValueOnce(user)
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventHandler(event)
    } catch {
      errorCaught = true
    }
    // If the handler catches and responds, this will pass; if not, errorCaught will be true
    if (!errorCaught) {
      expect(mockResponse).toHaveBeenCalledWith(500, 'Internal Server Error', event)
    }
  })

  it('returns 500 if write throws', async () => {
    const user = { name: 'Test User' }
    const input = { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' }
    const originalEvent = {
      classes: [{ date: '2025-06-10T00:00:00.000Z' }],
      createdAt: '2025-06-01T00:00:00.000Z',
      createdBy: 'Someone',
      endDate: '2025-06-12T00:00:00.000Z',
      entryEndDate: '2025-06-05T00:00:00.000Z',
      entryOrigEndDate: '2025-06-05T00:00:00.000Z',
      entryStartDate: '2025-06-01T00:00:00.000Z',
      id: 'event123',
      modifiedAt: '2025-06-01T00:00:00.000Z',
      modifiedBy: 'Someone',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
      state: 'published',
    }
    mockAuthorize.mockResolvedValueOnce(user)
    setEventBody(event, input)
    mockGetEvent.mockResolvedValueOnce({ ...originalEvent })
    mockNanoid.mockReturnValueOnce('newid123')
    mockSaveEvent.mockRejectedValueOnce(new Error('fail'))
    let errorCaught = false
    try {
      await copyEventHandler(event)
    } catch {
      errorCaught = true
    }
    if (!errorCaught) {
      expect(mockResponse).toHaveBeenCalledWith(500, 'Internal Server Error', event)
    }
  })
})
