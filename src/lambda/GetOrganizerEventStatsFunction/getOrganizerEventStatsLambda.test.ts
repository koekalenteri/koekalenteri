import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { authorizeWithMemberOf } from '../lib/auth'
import type { response } from '../utils/response'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

// Mocks
const mockReadAll: any = jest.fn()
const mockDynamoDB = {
  write: jest.fn(),
  query: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const baseStats = [
    { organizerId: 'org1', eventStartDate: '2024-01-01', eventEndDate: '2024-01-10', value: 1 },
    { organizerId: 'org2', eventStartDate: '2024-02-01', eventEndDate: '2024-02-10', value: 2 },
    { organizerId: 'org3', eventStartDate: '2024-03-01', eventEndDate: '2024-03-10', value: 3 },
  ]

  it('returns all stats for admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2'] })
    mockReadAll.mockResolvedValue(baseStats)
    mockResponse.mockImplementation((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(mockReadAll).toHaveBeenCalled()
    expect(JSON.parse(result.body)).toEqual(baseStats)
    expect(result.statusCode).toBe(200)
  })

  it('filters stats by memberOf for non-admin user', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockUser, memberOf: ['org2'] })
    mockReadAll.mockResolvedValue(baseStats)
    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(JSON.parse(result.body)).toEqual([baseStats[1]])
    expect(result.statusCode).toBe(200)
  })

  it('applies "from" and "to" date filters', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2', 'org3'] })
    mockReadAll.mockResolvedValue(baseStats)
    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, { query: { from: '2024-02-01', to: '2024-03-01' } })
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    // Only org2 (starts 2024-02-01) should match
    expect(JSON.parse(result.body)).toEqual([baseStats[1]])
    expect(result.statusCode).toBe(200)
  })

  it('returns early if authorizeWithMemberOf returns a response (unauthorized)', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ res: { statusCode: 401, body: 'Unauthorized' } })
    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(result.statusCode).toBe(401)
    expect(result.body).toBe('Unauthorized')
    expect(mockReadAll).not.toHaveBeenCalled()
  })

  it('returns empty array if no stats found', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ user: mockAdminUser, memberOf: ['org1', 'org2'] })
    mockReadAll.mockResolvedValue(undefined)
    mockResponse.mockImplementation((status: any, body: any) => ({ statusCode: status, body: JSON.stringify(body) }))

    const event = constructAPIGwEvent({}, {})
    const result = (await getOrganizerEventStatsLambda(event)) as APIGatewayProxyResult

    expect(JSON.parse(result.body)).toEqual([])
    expect(result.statusCode).toBe(200)
  })
})
