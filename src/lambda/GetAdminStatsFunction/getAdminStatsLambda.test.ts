import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { authorizeWithMemberOf } from '../lib/auth'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'

// Mocks
const mockReadAll: any = vi.fn()
const mockQuery: any = vi.fn()
const mockDynamoDB = {
  delete: vi.fn(),
  query: mockQuery,
  read: vi.fn(),
  readAll: mockReadAll,
  update: vi.fn(),
  write: vi.fn(),
} as any

const mockAuthorizeWithMemberOf = vi.fn<typeof authorizeWithMemberOf>()

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}
const mockAdminUser: JsonUser = {
  ...mockUser,
  admin: true,
}

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return mockDynamoDB
  }),
}))
const { default: getAdminStatsLambda } = await import('./handler')

describe('getAdminStatsLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseStats = [
    { date: '2024-01-01', organizerId: 'org1', value: 1 },
    { date: '2024-02-01', organizerId: 'org2', value: 2 },
    { date: '2024-03-01', organizerId: 'org3', value: 3 },
  ]

  it('returns all stats for admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockAdminUser })

    // Mock readAll to return items with PK property
    const statsWithPK = baseStats.map((stat) => ({
      ...stat,
      PK: `ORG#${stat.organizerId}`,
      SK: `${stat.date}#event-id`,
    }))
    mockReadAll.mockResolvedValueOnce(statsWithPK)

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith({
      filter: 'begins_with(#pk, :orgPrefix)',
      names: { '#pk': 'PK' },
      values: { ':orgPrefix': 'ORG#' },
    })
    expect(JSON.parse(result.body)).toEqual(statsWithPK)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by memberOf for non-admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org2'], user: mockUser })
    // For non-admin users, the code uses query instead of readAll
    mockQuery.mockResolvedValueOnce([baseStats[1]])

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockQuery).toHaveBeenCalledWith({
      filterExpression: undefined,
      key: '#pk = :pk',
      names: { '#pk': 'PK' },
      values: { ':pk': 'ORG#org2' },
    })
    expect(JSON.parse(result.body)).toEqual([baseStats[1]])
    expect(result.statusCode).toBe(200)
  })

  it('applies "from" and "to" date filters', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2', 'org3'], user: mockAdminUser })

    // Create stats with PK property
    const statsWithPK = baseStats.map((stat) => ({
      ...stat,
      PK: `ORG#${stat.organizerId}`,
      SK: `${stat.date}#event-id`,
    }))

    // Since we're now filtering at the database level with readAll,
    // we should mock that only the filtered item is returned
    const filteredStats = [statsWithPK[1]] // Only the middle item with date 2024-02-01
    mockReadAll.mockResolvedValueOnce(filteredStats)

    // Expected result should match what readAll returns
    const expectedResult = filteredStats

    const event = constructAPIGwEvent({}, { query: { from: '2024-02-01', to: '2024-02-28' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith({
      filter: 'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
      names: { '#pk': 'PK' },
      values: {
        ':from': '2024-02-01',
        ':orgPrefix': 'ORG#',
        ':to': '2024-02-28',
      },
    })

    // The result should only include the item that matches the date filters
    expect(JSON.parse(result.body)).toEqual(expectedResult)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by a single organizerId when requested by a member', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })
    mockQuery.mockResolvedValueOnce([baseStats[0]])

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org1' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockQuery).toHaveBeenCalledWith({
      filterExpression: undefined,
      key: '#pk = :pk',
      names: { '#pk': 'PK' },
      values: { ':pk': 'ORG#org1' },
    })
    expect(JSON.parse(result.body)).toEqual([baseStats[0]])
    expect(result.statusCode).toBe(200)
  })

  it('forbids a non-admin user from requesting an organizerId they are not a member of', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org3' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(403)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('allows an admin user to request any organizerId', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
    mockQuery.mockResolvedValueOnce([baseStats[2]])

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org3' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockQuery).toHaveBeenCalledWith({
      filterExpression: undefined,
      key: '#pk = :pk',
      names: { '#pk': 'PK' },
      values: { ':pk': 'ORG#org3' },
    })
    expect(JSON.parse(result.body)).toEqual([baseStats[2]])
    expect(result.statusCode).toBe(200)
  })

  it('returns early if authorizeWithMemberOf returns a response (unauthorized)', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ res: { body: 'Unauthorized', statusCode: 401 } })
    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(401)
    expect(result.body).toBe('Unauthorized')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns empty array if no stats found', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockAdminUser })
    mockReadAll.mockResolvedValueOnce(undefined)

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith({
      filter: 'begins_with(#pk, :orgPrefix)',
      names: { '#pk': 'PK' },
      values: { ':orgPrefix': 'ORG#' },
    })
    expect(JSON.parse(result.body)).toEqual([])
    expect(result.statusCode).toBe(200)
  })

  describe('capacity stats (?eventType)', () => {
    it("returns capacityStats for the caller's organizers instead of the event list", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org2'], user: mockUser })
      mockQuery.mockResolvedValueOnce([
        {
          eventCount: 2,
          organizerId: 'org2',
          PK: 'CAPACITY#NOME-B',
          places: 20,
          SK: '2025-06#ALO#org2',
          starters: 18,
        },
      ])

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filterExpression: '#organizerId IN (:organizerId0)',
          values: expect.objectContaining({ ':organizerId0': 'org2', ':pk': 'CAPACITY#NOME-B' }),
        })
      )
      expect(JSON.parse(result.body)).toEqual({
        capacityStats: [expect.objectContaining({ class: 'ALO', month: '2025-06', organizerId: 'org2' })],
      })
      expect(result.statusCode).toBe(200)
    })

    it('queries every organizer for an admin with no explicit organizer', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      mockQuery.mockResolvedValueOnce([])

      await getAdminStatsLambda(constructAPIGwEvent({}, { query: { eventType: 'NOME-B' } }))

      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ filterExpression: undefined }))
    })

    it('lets an admin request an organizer they are not a member of', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      mockQuery.mockResolvedValueOnce([])

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B', organizerId: 'org-elsewhere' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(200)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({ values: expect.objectContaining({ ':organizerId0': 'org-elsewhere' }) })
      )
    })

    it('rejects an organizer the caller does not belong to', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1'], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B', organizerId: 'org-elsewhere' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(403)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe('judge workload (?judges)', () => {
    it('returns judgeWorkload for the requested year without organizer scoping', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1'], user: mockUser })
      mockQuery.mockResolvedValueOnce([{ count: 5, name: 'Matti Meikäläinen', SK: '1' }])

      const event = constructAPIGwEvent({}, { query: { judges: '2025' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockQuery).toHaveBeenCalledWith({ key: 'PK = :pk', values: { ':pk': 'JUDGE#2025' } })
      expect(JSON.parse(result.body)).toEqual({
        judgeWorkload: [{ count: 5, judgeId: '1', name: 'Matti Meikäläinen' }],
      })
      expect(result.statusCode).toBe(200)
    })

    // Number() alone would accept several of these ('0x7E9', '2025.5', 'Infinity'), and a
    // truthiness guard would route '' and '0' to the organizer-stats response shape instead.
    it.each(['not-a-year', '', '0', '-1', '2025.5', '0x7E9', 'Infinity'])(
      'rejects the malformed year %j',
      async (judges) => {
        mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

        const event = constructAPIGwEvent({}, { query: { judges } })
        const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

        expect(result.statusCode).toBe(400)
        expect(mockQuery).not.toHaveBeenCalled()
        expect(mockReadAll).not.toHaveBeenCalled()
      }
    )
  })

  // The empty-list guard in getOrganizerStats/getCapacityStats keys off `=== 0`, so an admin's
  // `undefined` passes straight through it. These pin that down: admin means everything, and an
  // admin with an empty memberOf is still an admin.
  describe('an admin with no memberOf', () => {
    it("still gets every organizer's event stats", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      const all = baseStats.map((stat) => ({ ...stat, PK: `ORG#${stat.organizerId}`, SK: `${stat.date}#e` }))
      mockReadAll.mockResolvedValueOnce(all)

      const result = (await getAdminStatsLambda(constructAPIGwEvent({}, {}))) as APIGatewayProxyResult

      expect(mockReadAll).toHaveBeenCalledWith({
        filter: 'begins_with(#pk, :orgPrefix)',
        names: { '#pk': 'PK' },
        values: { ':orgPrefix': 'ORG#' },
      })
      expect(JSON.parse(result.body)).toEqual(all)
    })
  })

  describe('a non-admin who belongs to no organization', () => {
    // An empty memberOf used to fall through to the unfiltered "all organizers" query, handing
    // someone with no membership every organizer's figures.
    it("gets no event stats rather than every organizer's", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

      const result = (await getAdminStatsLambda(constructAPIGwEvent({}, {}))) as APIGatewayProxyResult

      expect(mockReadAll).not.toHaveBeenCalled()
      expect(mockQuery).not.toHaveBeenCalled()
      expect(JSON.parse(result.body)).toEqual([])
    })

    it('gets no capacity stats rather than the nationwide total', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockQuery).not.toHaveBeenCalled()
      expect(JSON.parse(result.body)).toEqual({ capacityStats: [] })
    })
  })
})
