import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { authorizeWithMemberOf } from '../lib/auth'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

// Mocks
const mockReadAll: any = jest.fn()
const mockQuery: any = jest.fn()
const mockDynamoDB = {
  delete: jest.fn(),
  query: mockQuery,
  read: jest.fn(),
  readAll: mockReadAll,
  update: jest.fn(),
  write: jest.fn(),
} as any

const mockAuthorizeWithMemberOf = jest.fn<typeof authorizeWithMemberOf>()

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

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))
const { default: getOrganizerEventStatsLambda } = await import('./handler')

describe('getOrganizerEventStatsLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.clearAllMocks()
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
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith(
      undefined,
      'begins_with(#pk, :orgPrefix)',
      { ':orgPrefix': 'ORG#' },
      { '#pk': 'PK' }
    )
    expect(JSON.parse(result.body)).toEqual(statsWithPK)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by memberOf for non-admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org2'], user: mockUser })
    // For non-admin users, the code uses query instead of readAll
    mockQuery.mockResolvedValueOnce([baseStats[1]])

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

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
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith(
      undefined,
      'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
      {
        ':from': '2024-02-01',
        ':orgPrefix': 'ORG#',
        ':to': '2024-02-28',
      },
      { '#pk': 'PK' }
    )

    // The result should only include the item that matches the date filters
    expect(JSON.parse(result.body)).toEqual(expectedResult)
    expect(result.statusCode).toBe(200)
  })

  it('returns early if authorizeWithMemberOf returns a response (unauthorized)', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ res: { body: 'Unauthorized', statusCode: 401 } })
    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(401)
    expect(result.body).toBe('Unauthorized')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns empty array if no stats found', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org1', 'org2'], user: mockAdminUser })
    mockReadAll.mockResolvedValueOnce(undefined)

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith(
      undefined,
      'begins_with(#pk, :orgPrefix)',
      { ':orgPrefix': 'ORG#' },
      { '#pk': 'PK' }
    )
    expect(JSON.parse(result.body)).toEqual([])
    expect(result.statusCode).toBe(200)
  })
})
