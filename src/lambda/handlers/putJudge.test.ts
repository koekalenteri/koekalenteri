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

const { default: putJudgeLambda, dynamoDB } = await import('./putJudge')
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

describe('putJudgeLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await putJudgeLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('should write the authorized user to database', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await putJudgeLambda(
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
