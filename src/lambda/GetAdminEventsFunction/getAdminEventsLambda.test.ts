import { jest } from '@jest/globals'

const mockAuthorizeWithMemberOf = jest.fn<any>()
const mockLambda = jest.fn((name, fn) => fn)
const mockResponse = jest.fn()
const mockQuery = jest.fn<any>()
const mockReadAll = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))
jest.unstable_mockModule('../lib/lambda', () => ({
  lambda: mockLambda,
  response: mockResponse,
}))
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    query: mockQuery,
    readAll: mockReadAll,
  })),
}))

const { default: getAdminEventsLambda } = await import('./handler')

describe('getAdminEventsLambda', () => {
  const event = {
    headers: {},
    body: '',
    queryStringParameters: null,
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns response from authorizeWithMemberOf if it exists', async () => {
    const res = { statusCode: 401, body: 'Unauthorized' }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await getAdminEventsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('returns all events for admin user', async () => {
    const user = { id: 'admin1', admin: true }
    const memberOf = ['org1']
    const allEvents = [
      { id: 'event1', organizer: { id: 'org1' } },
      { id: 'event2', organizer: { id: 'org2' } },
      { id: 'event3', organizer: { id: 'org3' } },
    ]

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockReadAll.mockResolvedValueOnce(allEvents)

    await getAdminEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, allEvents, event)
  })

  it('filters events for non-admin user based on membership', async () => {
    const user = { id: 'user1', admin: false }
    const memberOf = ['org1', 'org3']
    const allEvents = [
      { id: 'event1', organizer: { id: 'org1' } },
      { id: 'event2', organizer: { id: 'org2' } },
      { id: 'event3', organizer: { id: 'org3' } },
    ]
    const filteredEvents = [
      { id: 'event1', organizer: { id: 'org1' } },
      { id: 'event3', organizer: { id: 'org3' } },
    ]

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockReadAll.mockResolvedValueOnce(allEvents)

    await getAdminEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, filteredEvents, event)
  })

  it('queries events with since parameter', async () => {
    const user = { id: 'admin1', admin: true }
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

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockQuery.mockResolvedValueOnce(seasonEvents1)
    mockQuery.mockResolvedValueOnce(seasonEvents2)

    await getAdminEventsLambda(eventWithSince)

    // Check that query was called for each season
    expect(mockQuery).toHaveBeenCalledTimes(endSeason - startSeason + 1)

    // Check first query call
    expect(mockQuery).toHaveBeenCalledWith({
      key: 'season = :season AND modifiedAt > :modifiedAfter',
      values: {
        ':season': startSeason.toString(),
        ':modifiedAfter': new Date(Number(since)).toISOString(),
      },
      table: expect.any(String),
      index: 'gsiSeasonModifiedAt',
    })

    // Check that response combines all season events
    expect(mockResponse).toHaveBeenCalledWith(200, [...seasonEvents1, ...seasonEvents2], eventWithSince)
  })

  it('returns empty array if no events found', async () => {
    const user = { id: 'user1', admin: false }
    const memberOf = ['org4'] // Member of org with no events
    const allEvents = [
      { id: 'event1', organizer: { id: 'org1' } },
      { id: 'event2', organizer: { id: 'org2' } },
    ]

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockReadAll.mockResolvedValueOnce(allEvents)

    await getAdminEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, [], event)
  })

  it('handles undefined result from readAll', async () => {
    const user = { id: 'admin1', admin: true }
    const memberOf = ['org1']

    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ user, memberOf })
    mockReadAll.mockResolvedValueOnce(undefined)

    await getAdminEventsLambda(event)

    expect(mockReadAll).toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })
})
