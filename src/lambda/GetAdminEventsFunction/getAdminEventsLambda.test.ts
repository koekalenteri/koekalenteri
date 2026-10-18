import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockReadSeasonEvents = vi.fn()
const mockReadSeasonEventsUpdatedSince = vi.fn()
const mockReadOrganizerEvents = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))
vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))
vi.doMock('../lib/repositories/eventRepository', () => ({
  readOrganizerEvents: mockReadOrganizerEvents,
  readSeasonEvents: mockReadSeasonEvents,
  readSeasonEventsUpdatedSince: mockReadSeasonEventsUpdatedSince,
}))

const { default: getAdminEventsLambda } = await import('./handler')

describe('getAdminEventsLambda', () => {
  // Several tests freeze the clock; none may leave it frozen for the next.
  afterEach(() => vi.useRealTimers())

  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    queryStringParameters: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('answers the auth refusal without reading anything', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockRejectedValueOnce(httpError(res.statusCode, res.body))

    await getAdminEventsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockReadSeasonEvents).not.toHaveBeenCalled()
    expect(mockReadOrganizerEvents).not.toHaveBeenCalled()
  })

  // A superadmin sees every club, so the list walks the seasons back from next year and stops once
  // two in a row are empty; nothing scans the table (KOE-1341).
  it('reads every season for a superadmin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const bySeason: Record<string, object[]> = {
      '2025': [{ id: 'event2', organizer: { id: 'org2' } }],
      '2026': [{ id: 'event1', organizer: { id: 'org1' } }],
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockReadSeasonEvents.mockImplementation(async (season: number) => bySeason[season] ?? [])

    await getAdminEventsLambda(event)

    // 2027 (empty), 2026, 2025, 2024 (empty), 2023 (empty) -> stop
    expect(mockReadSeasonEvents).toHaveBeenCalledTimes(5)
    expect(mockReadSeasonEvents).toHaveBeenNthCalledWith(1, 2027)
    expect(mockReadSeasonEvents).toHaveBeenNthCalledWith(5, 2023)
    expect(mockResponse).toHaveBeenCalledWith(200, [...bySeason['2026'], ...bySeason['2025']], event)

    mockReadSeasonEvents.mockReset()
  })

  it("reads a club administrator's clubs by organizer", async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1', 'org3']
    const byOrganizer: Record<string, object[]> = {
      org1: [{ id: 'event1', organizer: { id: 'org1' } }],
      org3: [{ id: 'event3', organizer: { id: 'org3' } }],
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockReadOrganizerEvents.mockImplementation(async (organizerId: string) => byOrganizer[organizerId] ?? [])

    await getAdminEventsLambda(event)

    expect(mockReadOrganizerEvents).toHaveBeenCalledTimes(2)
    expect(mockReadOrganizerEvents).toHaveBeenNthCalledWith(1, 'org1')
    expect(mockReadOrganizerEvents).toHaveBeenNthCalledWith(2, 'org3')
    expect(mockResponse).toHaveBeenCalledWith(200, [...byOrganizer.org1, ...byOrganizer.org3], event)

    mockReadOrganizerEvents.mockReset()
  })

  it('queries events with since parameter', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const since = '1717171717171' // 31.5.2024 16:08Z
    const eventWithSince = {
      ...event,
      queryStringParameters: { since },
    }

    const startSeason = 2024
    const endSeason = 2027

    const seasonEvents1 = [{ id: 'event1', organizer: { id: 'org1' } }]
    const seasonEvents2 = [{ id: 'event2', organizer: { id: 'org2' } }]

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockReadSeasonEventsUpdatedSince.mockResolvedValueOnce(seasonEvents1)
    mockReadSeasonEventsUpdatedSince.mockResolvedValueOnce(seasonEvents2)

    await getAdminEventsLambda(eventWithSince)

    // Check that query was called for each season
    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenCalledTimes(endSeason - startSeason + 1)
    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenCalledWith(startSeason, new Date(Number(since)).toISOString())
    expect(mockReadSeasonEvents).not.toHaveBeenCalled()

    // Check that response combines all season events
    expect(mockResponse).toHaveBeenCalledWith(200, [...seasonEvents1, ...seasonEvents2], eventWithSince)
  })

  // Before New Year a trial in early January is already next season's, and the full read lists it:
  // the since walk has to reach the same season, or an edit to it never comes back (KOE-1555).
  it('walks the since query up to next season, as the full read does', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-20T10:00:00.000Z'))
    const since = String(Date.parse('2026-12-19T10:00:00.000Z'))
    const nextSeasonEvents = [{ id: 'event2027', organizer: { id: 'org1' } }]
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org1'], user: { admin: true, id: 'admin1' } })
    mockReadSeasonEventsUpdatedSince.mockImplementation(async (season: number) =>
      season === 2027 ? nextSeasonEvents : []
    )

    await getAdminEventsLambda({ ...event, queryStringParameters: { since } })

    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenCalledTimes(2)
    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenNthCalledWith(1, 2026, '2026-12-19T10:00:00.000Z')
    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenNthCalledWith(2, 2027, '2026-12-19T10:00:00.000Z')
    expect(mockResponse).toHaveBeenCalledWith(200, nextSeasonEvents, expect.anything())

    mockReadSeasonEventsUpdatedSince.mockReset()
  })

  it('answers 400 to a since that has no calendar day', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org1'], user: { admin: true, id: 'admin1' } })

    await getAdminEventsLambda({ ...event, queryStringParameters: { since: '-62135596800000' } })

    expect(mockResponse).toHaveBeenCalledWith(400, 'Bad request: since must be a valid time', expect.anything())
    expect(mockReadSeasonEventsUpdatedSince).not.toHaveBeenCalled()
  })

  // 22:30Z on 31.12.2025 is already 2026 in Finland: the seasons are Finnish years, as the events' are.
  it('starts the since walk from the Finnish season of the instant', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const since = String(Date.parse('2025-12-31T22:30:00.000Z'))
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org1'], user: { admin: true, id: 'admin1' } })
    mockReadSeasonEventsUpdatedSince.mockResolvedValue([])

    await getAdminEventsLambda({ ...event, queryStringParameters: { since } })

    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenCalledTimes(2)
    expect(mockReadSeasonEventsUpdatedSince).toHaveBeenNthCalledWith(1, 2026, '2025-12-31T22:30:00.000Z')

    mockReadSeasonEventsUpdatedSince.mockReset()
  })

  it('returns an empty array for a club with no events', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org4']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockReadOrganizerEvents.mockResolvedValueOnce([])

    await getAdminEventsLambda(event)

    expect(mockReadOrganizerEvents).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('treats an undefined query result as no events', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockReadOrganizerEvents.mockResolvedValueOnce(undefined)

    await getAdminEventsLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })
})
