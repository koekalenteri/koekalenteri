import type { JsonUser } from '../../types'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: jest.fn(() => ({})),
}))

jest.unstable_mockModule('../utils/auth', () => ({
  authorize: jest.fn(),
  getOrigin: jest.fn(),
  getAndUpdateUserByEmail: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ readAll: jest.fn() })),
}))

const { authorize } = await import('../utils/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: getOfficialsHandler, dynamoDB } = await import('./handler')
const mockDynamoDB = dynamoDB as jest.Mocked<typeof dynamoDB>

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

describe('getOfficialsHandler', () => {
  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getOfficialsHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getOfficialsHandler(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('should return all non-deleted officials', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.readAll.mockResolvedValue([{ deletedAt: 'sometimes' }, { name: 'not deleted' }])

    const res = await getOfficialsHandler(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"name":"not deleted"}]"')
  })
})
