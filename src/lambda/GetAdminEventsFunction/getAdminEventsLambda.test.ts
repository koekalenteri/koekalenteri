import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockQuery = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))
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

const { default: getAdminEventsLambda } = await import('./handler')

describe('getAdminEventsLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    queryStringParameters: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns response from authorizeWithMemberOf if it exists', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getAdminEventsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  // A superadmin sees every club, so the list walks the seasons back from next year and stops once
  // two in a row are empty; nothing scans the table (KOE-1341).
  it('reads every season through the index for a superadmin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T00:00:00.000Z'))
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const bySeason: Record<string, object[]> = {
      '2025': [{ id: 'event2', organizer: { id: 'org2' } }],
      '2026': [{ id: 'event1', organizer: { id: 'org1' } }],
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockQuery.mockImplementation(
      async ({ values }: { values: Record<string, string> }) => bySeason[values[':season']] ?? []
    )

    await getAdminEventsLambda(event)

    // 2027 (empty), 2026, 2025, 2024 (empty), 2023 (empty) -> stop
    expect(mockQuery).toHaveBeenCalledTimes(5)
    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiSeasonStartDate',
      key: 'season = :season',
      table: expect.any(String),
      values: { ':season': '2027' },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, [...bySeason['2026'], ...bySeason['2025']], event)

    mockQuery.mockReset()
    vi.useRealTimers()
  })

  it("reads a club administrator's clubs through the organizer index", async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1', 'org3']
    const byOrganizer: Record<string, object[]> = {
      org1: [{ id: 'event1', organizer: { id: 'org1' } }],
      org3: [{ id: 'event3', organizer: { id: 'org3' } }],
    }

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockQuery.mockImplementation(
      async ({ values }: { values: Record<string, string> }) => byOrganizer[values[':organizerId']] ?? []
    )

    await getAdminEventsLambda(event)

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery).toHaveBeenNthCalledWith(1, {
      index: 'gsiOrganizerStartDate',
      key: 'organizerId = :organizerId',
      table: expect.any(String),
      values: { ':organizerId': 'org1' },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, [...byOrganizer.org1, ...byOrganizer.org3], event)

    mockQuery.mockReset()
  })

  it('queries events with since parameter', async () => {
    const user = { admin: true, id: 'admin1' }
    const memberOf = ['org1']
    const since = '1717171717171'
    const eventWithSince = {
      ...event,
      queryStringParameters: { since },
    }

    const startSeason = 2024 // Assuming the date corresponds to 2024
    const endSeason = new Date().getFullYear()

    const seasonEvents1 = [{ id: 'event1', organizer: { id: 'org1' } }]
    const seasonEvents2 = [{ id: 'event2', organizer: { id: 'org2' } }]

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockQuery.mockResolvedValueOnce(seasonEvents1)
    mockQuery.mockResolvedValueOnce(seasonEvents2)

    await getAdminEventsLambda(eventWithSince)

    // Check that query was called for each season
    expect(mockQuery).toHaveBeenCalledTimes(endSeason - startSeason + 1)

    // Check first query call
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'gsiSeasonUpdatedAt',
      key: 'season = :season AND updatedAt >= :updatedAfter',
      table: expect.any(String),
      values: {
        ':season': startSeason.toString(),
        ':updatedAfter': new Date(Number(since)).toISOString(),
      },
    })

    // Check that response combines all season events
    expect(mockResponse).toHaveBeenCalledWith(200, [...seasonEvents1, ...seasonEvents2], eventWithSince)
  })

  it('returns an empty array for a club with no events', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org4']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockQuery.mockResolvedValueOnce([])

    await getAdminEventsLambda(event)

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('treats an undefined query result as no events', async () => {
    const user = { admin: false, id: 'user1' }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf, user })
    mockQuery.mockResolvedValueOnce(undefined)

    await getAdminEventsLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })
})
