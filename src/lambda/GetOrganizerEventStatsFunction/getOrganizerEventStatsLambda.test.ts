import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { authorizeWithMemberOf } from '../lib/auth'
import type { response } from '../utils/response'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

// Mocks
const mockReadAll: any = jest.fn()
const mockQuery: any = jest.fn()
const mockDynamoDB = {
  write: jest.fn(),
  query: mockQuery,
  update: jest.fn(),
  read: jest.fn(),
  readAll: mockReadAll,
  delete: jest.fn(),
} as any

const mockAuthorizeWithMemberOf = jest.fn<typeof authorizeWithMemberOf>()
const mockResponse = jest.fn<typeof response>()

const mockUser: JsonUser = {
  id: '',
  createdAt: '',
  createdBy: 'test',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  email: 'test@example.com',
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
jest.unstable_mockModule('../utils/response', () => ({
  response: mockResponse,
}))

const { default: getOrganizerEventStatsLambda } = await import('./handler')

describe('getOrganizerEventStatsLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const baseStats = [
    { organizerId: 'org1', date: '2024-01-01', value: 1 },
    { organizerId: 'org2', date: '2024-02-01', value: 2 },
    { organizerId: 'org3', date: '2024-03-01', value: 3 },
  ]

  it('returns all stats for admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2'] })

    // Mock readAll to return items with PK property
    const statsWithPK = baseStats.map((stat) => ({
      ...stat,
      PK: `ORG#${stat.organizerId}`,
      SK: `${stat.date}#event-id`,
    }))
    mockReadAll.mockResolvedValueOnce(statsWithPK)

    mockResponse.mockImplementation((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))

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
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockUser, memberOf: ['org2'] })
    // For non-admin users, the code uses query instead of readAll
    mockQuery.mockResolvedValueOnce([baseStats[1]])
    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockQuery).toHaveBeenCalledWith(
      '#pk = :pk',
      { ':pk': 'ORG#org2' },
      undefined,
      undefined,
      { '#pk': 'PK' },
      undefined,
      undefined,
      undefined
    )
    expect(JSON.parse(result.body)).toEqual([baseStats[1]])
    expect(result.statusCode).toBe(200)
  })

  it('applies "from" and "to" date filters', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2', 'org3'] })

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

    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, { query: { from: '2024-02-01', to: '2024-02-28' } })
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalledWith(
      undefined,
      'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
      {
        ':orgPrefix': 'ORG#',
        ':from': '2024-02-01',
        ':to': '2024-02-28',
      },
      { '#pk': 'PK' }
    )

    // The result should only include the item that matches the date filters
    expect(JSON.parse(result.body)).toEqual(expectedResult)
    expect(result.statusCode).toBe(200)
  })

  it('returns early if authorizeWithMemberOf returns a response (unauthorized)', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ res: { statusCode: 401, body: 'Unauthorized' } })
    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(401)
    expect(result.body).toBe('Unauthorized')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('returns empty array if no stats found', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2'] })
    mockReadAll.mockResolvedValueOnce(undefined)
    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

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
