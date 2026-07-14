import type { JsonUser } from '../../types'
import { jest } from '@jest/globals'

const mockPublishAdminDataInvalidation = jest.fn<any>()
jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: jest.fn(() => ({})),
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
  getAndUpdateUserByEmail: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ readAll: jest.fn() })),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: getOfficialsLambda, dynamoDB } = await import('./handler')
const mockDynamoDB = dynamoDB as jest.Mocked<typeof dynamoDB>

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

describe('getOfficialsLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getOfficialsLambda(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getOfficialsLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('should return all non-deleted officials', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.readAll.mockResolvedValue([{ deletedAt: 'sometimes' }, { name: 'not deleted' }])

    const res = await getOfficialsLambda(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"name":"not deleted"}]"')
  })

  it('returns changed officials and deletion tombstones since the requested time', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.readAll.mockResolvedValue([
      { id: 1, modifiedAt: '2024-01-01T00:00:00.000Z', name: 'unchanged' },
      { id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' },
      { deletedAt: '2024-01-04T00:00:00.000Z', id: 3, modifiedAt: '2024-01-01T00:00:00.000Z' },
    ])

    const res = await getOfficialsLambda(
      constructAPIGwEvent({}, { query: { since: String(new Date('2024-01-02T00:00:00.000Z').getTime()) } })
    )

    expect(JSON.parse(res.body)).toEqual({
      cursor: Date.parse('2024-01-04T00:00:00.000Z'),
      deletedIds: ['3'],
      items: [{ id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' }],
    })
  })
})
