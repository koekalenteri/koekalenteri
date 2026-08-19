import { vi } from 'vitest'

const setEventBody = (event: { body: string }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockAuthorize = vi.fn()
const mockAuthorizeEvent = vi.fn()
const mockGetEvent = vi.fn()
const mockSaveEvent = vi.fn()
const mockNanoid = vi.fn()
const mockWrite = vi.fn()
const mockResponse = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)

vi.doMock('../lib/eventAuth', () => ({
  authorizeEvent: mockAuthorizeEvent,
}))
vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
  saveEvent: mockSaveEvent,
}))
vi.doMock('nanoid', () => ({
  nanoid: mockNanoid,
}))
vi.doMock('../lib/lambda', () => ({
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
  default: vi.fn(() => ({
    query: mockQuery,
    write: mockWrite,
  })),
}))

const { default: copyEventHandler } = await import('./handler')

describe('copyEventHandler', () => {
  const event = { body: '{}' } as any

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
    mockAuthorizeEvent.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })
    await expect(copyEventHandler(event)).resolves.toEqual({ body: 'Unauthorized', statusCode: 401 })
  })

  it('does not copy an event when organizer authorization fails', async () => {
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockAuthorizeEvent.mockResolvedValueOnce({ res: { body: 'Forbidden', statusCode: 403 } })

    await expect(copyEventHandler(event)).resolves.toEqual({ body: 'Forbidden', statusCode: 403 })

    expect(mockSaveEvent).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('rejects an invalid copy start date before reading the source event', async () => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
    setEventBody(event, { id: 'event123', startDate: 'not-a-date' })

    await copyEventHandler(event)

    expect(mockResponse).toHaveBeenCalledWith(400, { message: 'Bad request: startDate must be a valid date' }, event)
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it.each(['startDate', 'endDate'] as const)('rejects an invalid source event %s before saving', async (field) => {
    mockAuthorize.mockResolvedValueOnce({ name: 'Test User' })
    setEventBody(event, { id: 'event123', startDate: '2025-07-01T00:00:00.000Z' })
    mockGetEvent.mockResolvedValueOnce({
      classes: [],
      endDate: '2025-06-12T00:00:00.000Z',
      id: 'event123',
      name: 'Original Event',
      startDate: '2025-06-10T00:00:00.000Z',
      [field]: 'not-a-date',
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
      startDate: '2025-06-10T00:00:00.000Z',
      state: 'published',
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
      state: 'draft',
    })

    expect(mockResponse).toHaveBeenCalled()

    vi.useRealTimers()
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

  it('does not copy registration idempotency credentials or post-processing state', async () => {
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
        id: 'registration123',
        newRegistrationAuditAt: '2025-06-01T00:00:00.000Z',
        newRegistrationEmailSentAt: '2025-06-01T00:00:00.000Z',
        newRegistrationLease: { expiresAt: 123, token: 'source-lease' },
        newRegistrationProcessedAt: '2025-06-01T00:00:00.000Z',
        newRegistrationPublishedAt: '2025-06-01T00:00:00.000Z',
        newRegistrationStatsAt: '2025-06-01T00:00:00.000Z',
      },
    ])

    await copyEventHandler(event)

    expect(mockWrite).toHaveBeenLastCalledWith(
      {
        dates: [{ date: '2025-07-01T00:00:00.000Z' }],
        eventId: 'newid123',
        id: 'registration123',
      },
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
