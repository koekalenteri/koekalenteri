import type { JsonUser } from '../../types'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ write: jest.fn() })),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: putJudgeHandler, dynamoDB } = await import('./handler')
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

describe('putJudgeHandler', () => {
  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await putJudgeHandler(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('should write the authorized user to database', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await putJudgeHandler(
      constructAPIGwEvent({ id: 'judge', name: 'Test Judge', createdAt: '1986-10-05T22:39:02.250Z' })
    )

    expect(mockDynamoDB.write).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'judge',
        name: 'Test Judge',
        createdAt: '1986-10-05T22:39:02.250Z',
        createdBy: 'Test User',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
      })
    )
  })
})
