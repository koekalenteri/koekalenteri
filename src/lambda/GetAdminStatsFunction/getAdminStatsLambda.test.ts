import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { authorizeWithMemberOf } from '../lib/auth'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

// The stats rows as the repository reads them; the keys and filters it builds are its own test's
// (eventStatsRepository.test.ts).
const mockReadOrganizerEventStats = vi.fn()
const mockReadAllOrganizerEventStats = vi.fn()
const mockReadCapacityStats = vi.fn()
const mockReadJudgeWorkload = vi.fn()

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
vi.doMock('../lib/repositories/eventStatsRepository', () => ({
  readAllOrganizerEventStats: mockReadAllOrganizerEventStats,
  readCapacityStats: mockReadCapacityStats,
  readJudgeWorkload: mockReadJudgeWorkload,
  readOrganizerEventStats: mockReadOrganizerEventStats,
}))
const { default: getAdminStatsLambda } = await import('./handler')

const expectNothingRead = () => {
  expect(mockReadOrganizerEventStats).not.toHaveBeenCalled()
  expect(mockReadAllOrganizerEventStats).not.toHaveBeenCalled()
  expect(mockReadCapacityStats).not.toHaveBeenCalled()
  expect(mockReadJudgeWorkload).not.toHaveBeenCalled()
}

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
  const withKeys = (stats: typeof baseStats) =>
    stats.map((stat) => ({ ...stat, PK: `ORG#${stat.organizerId}`, SK: `${stat.date}#event-id` }))

  it('returns all stats for admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockAdminUser })
    const statsWithPK = withKeys(baseStats)
    mockReadAllOrganizerEventStats.mockResolvedValueOnce(statsWithPK)

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAllOrganizerEventStats).toHaveBeenCalledWith(undefined, undefined)
    expect(mockReadOrganizerEventStats).not.toHaveBeenCalled()
    expect(JSON.parse(result.body)).toEqual(statsWithPK)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by memberOf for non-admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org2'], user: mockUser })
    mockReadOrganizerEventStats.mockResolvedValueOnce([baseStats[1]])

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadOrganizerEventStats).toHaveBeenCalledTimes(1)
    expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org2', undefined, undefined)
    expect(mockReadAllOrganizerEventStats).not.toHaveBeenCalled()
    expect(JSON.parse(result.body)).toEqual([baseStats[1]])
    expect(result.statusCode).toBe(200)
  })

  it("merges every member organizer's rows in date order", async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org3', 'org1'], user: mockUser })
    mockReadOrganizerEventStats.mockImplementation(async (organizerId: string) =>
      baseStats.filter((stat) => stat.organizerId === organizerId)
    )

    const result = (await getAdminStatsLambda(constructAPIGwEvent({}, {}))) as APIGatewayProxyResult

    expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org3', undefined, undefined)
    expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org1', undefined, undefined)
    expect(JSON.parse(result.body)).toEqual([baseStats[0], baseStats[2]])
  })

  it('applies "from" and "to" date filters', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2', 'org3'], user: mockAdminUser })
    const filteredStats = [withKeys(baseStats)[1]]
    mockReadAllOrganizerEventStats.mockResolvedValueOnce(filteredStats)

    const event = constructAPIGwEvent({}, { query: { from: '2024-02-01', to: '2024-02-28' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAllOrganizerEventStats).toHaveBeenCalledWith('2024-02-01', '2024-02-28')
    expect(JSON.parse(result.body)).toEqual(filteredStats)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by a single organizerId when requested by a member', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })
    mockReadOrganizerEventStats.mockResolvedValueOnce([baseStats[0]])

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org1' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadOrganizerEventStats).toHaveBeenCalledTimes(1)
    expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org1', undefined, undefined)
    expect(JSON.parse(result.body)).toEqual([baseStats[0]])
    expect(result.statusCode).toBe(200)
  })

  it('forbids a non-admin user from requesting an organizerId they are not a member of', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org3' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(403)
    expectNothingRead()
  })

  it('allows an admin user to request any organizerId', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
    mockReadOrganizerEventStats.mockResolvedValueOnce([baseStats[2]])

    const event = constructAPIGwEvent({}, { query: { organizerId: 'org3' } })
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadOrganizerEventStats).toHaveBeenCalledWith('org3', undefined, undefined)
    expect(JSON.parse(result.body)).toEqual([baseStats[2]])
    expect(result.statusCode).toBe(200)
  })

  it('answers the auth refusal without reading anything', async () => {
    mockAuthorizeWithMemberOf.mockRejectedValue(httpError(401, 'Unauthorized'))
    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(401)
    expect(JSON.parse(result.body)).toBe('Unauthorized')
    expectNothingRead()
  })

  it('returns empty array if no stats found', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockAdminUser })
    mockReadAllOrganizerEventStats.mockResolvedValueOnce([])

    const event = constructAPIGwEvent({}, {})
    const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAllOrganizerEventStats).toHaveBeenCalledWith(undefined, undefined)
    expect(JSON.parse(result.body)).toEqual([])
    expect(result.statusCode).toBe(200)
  })

  describe('capacity stats (?eventType)', () => {
    it("returns capacityStats for the caller's organizers instead of the event list", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org2'], user: mockUser })
      mockReadCapacityStats.mockResolvedValueOnce([
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

      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOME-B', ['org2'], undefined, undefined)
      expect(JSON.parse(result.body)).toEqual({
        capacityStats: [expect.objectContaining({ class: 'ALO', month: '2025-06', organizerId: 'org2' })],
      })
      expect(mockReadOrganizerEventStats).not.toHaveBeenCalled()
      expect(result.statusCode).toBe(200)
    })

    it('queries every organizer for an admin with no explicit organizer', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      mockReadCapacityStats.mockResolvedValueOnce([])

      await getAdminStatsLambda(constructAPIGwEvent({}, { query: { eventType: 'NOME-B' } }))

      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOME-B', undefined, undefined, undefined)
    })

    it('lets an admin request an organizer they are not a member of', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      mockReadCapacityStats.mockResolvedValueOnce([])

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B', organizerId: 'org-elsewhere' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(200)
      expect(mockReadCapacityStats).toHaveBeenCalledWith('NOME-B', ['org-elsewhere'], undefined, undefined)
    })

    it('rejects an organizer the caller does not belong to', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1'], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B', organizerId: 'org-elsewhere' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(403)
      expectNothingRead()
    })
  })

  describe('judge workload (?judges)', () => {
    const judgeRow = { count: 5, judgeId: '1', name: 'Matti Meikäläinen', organizerId: 'org1', SK: 'org1#1' }

    it('returns judgeWorkload for the requested year over every organizer for an admin', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      mockReadJudgeWorkload.mockResolvedValueOnce([judgeRow])

      const event = constructAPIGwEvent({}, { query: { judges: '2025' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockReadJudgeWorkload).toHaveBeenCalledWith(2025, undefined)
      expect(JSON.parse(result.body)).toEqual({
        judgeWorkload: [{ count: 5, judgeId: '1', name: 'Matti Meikäläinen' }],
      })
      expect(result.statusCode).toBe(200)
    })

    it('scopes a non-admin to the organizers they belong to', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })
      mockReadJudgeWorkload.mockResolvedValueOnce([judgeRow])

      const event = constructAPIGwEvent({}, { query: { judges: '2025' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockReadJudgeWorkload).toHaveBeenCalledWith(2025, ['org1', 'org2'])
      expect(result.statusCode).toBe(200)
    })

    it('narrows to an explicitly selected organizer', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockUser })
      mockReadJudgeWorkload.mockResolvedValueOnce([judgeRow])

      const event = constructAPIGwEvent({}, { query: { judges: '2025', organizerId: 'org1' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(mockReadJudgeWorkload).toHaveBeenCalledWith(2025, ['org1'])
      expect(result.statusCode).toBe(200)
    })

    it('rejects an organizer the caller does not belong to', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1'], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { judges: '2025', organizerId: 'org-elsewhere' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(403)
      expectNothingRead()
    })

    it('returns nothing for a non-admin who belongs to no organizer', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { judges: '2025' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expect(result.statusCode).toBe(200)
      expect(JSON.parse(result.body)).toEqual({ judgeWorkload: [] })
      expectNothingRead()
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
        expectNothingRead()
      }
    )
  })

  // The empty-list guard in getOrganizerStats/getCapacityStats keys off `=== 0`, so an admin's
  // `undefined` passes straight through it. These pin that down: admin means everything, and an
  // admin with an empty memberOf is still an admin.
  describe('an admin with no memberOf', () => {
    it("still gets every organizer's event stats", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockAdminUser })
      const all = withKeys(baseStats)
      mockReadAllOrganizerEventStats.mockResolvedValueOnce(all)

      const result = (await getAdminStatsLambda(constructAPIGwEvent({}, {}))) as APIGatewayProxyResult

      expect(mockReadAllOrganizerEventStats).toHaveBeenCalledWith(undefined, undefined)
      expect(JSON.parse(result.body)).toEqual(all)
    })
  })

  describe('a non-admin who belongs to no organization', () => {
    // An empty memberOf used to fall through to the unfiltered "all organizers" query, handing
    // someone with no membership every organizer's figures.
    it("gets no event stats rather than every organizer's", async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

      const result = (await getAdminStatsLambda(constructAPIGwEvent({}, {}))) as APIGatewayProxyResult

      expectNothingRead()
      expect(JSON.parse(result.body)).toEqual([])
    })

    it('gets no capacity stats rather than the nationwide total', async () => {
      mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: mockUser })

      const event = constructAPIGwEvent({}, { query: { eventType: 'NOME-B' } })
      const result = (await getAdminStatsLambda(event)) as APIGatewayProxyResult

      expectNothingRead()
      expect(JSON.parse(result.body)).toEqual({ capacityStats: [] })
    })
  })
})
