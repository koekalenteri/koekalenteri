import type { JsonUser } from '../../types'
import { jest } from '@jest/globals'

const mockPublishAdminDataInvalidation = jest.fn<any>()
jest.unstable_mockModule('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

const mockAuthorizeAdmin = jest.fn<any>()
jest.unstable_mockModule('../lib/auth', () => ({ authorizeAdmin: mockAuthorizeAdmin }))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ write: jest.fn() })),
}))

const { default: putJudgeLambda, dynamoDB } = await import('./handler')
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

describe('putJudgeLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    mockAuthorizeAdmin.mockResolvedValueOnce({ res: { statusCode: 401 } })
    const res = await putJudgeLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('returns 403 if the authenticated user is not an admin', async () => {
    mockAuthorizeAdmin.mockResolvedValueOnce({ res: { statusCode: 403 }, user: { ...mockUser, admin: false } })

    const res = await putJudgeLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(403)
    expect(mockDynamoDB.write).not.toHaveBeenCalled()
  })

  it('should write the authorized user to database', async () => {
    mockAuthorizeAdmin.mockResolvedValueOnce({ user: { ...mockUser, admin: true } })
    await putJudgeLambda(
      constructAPIGwEvent({ createdAt: '1986-10-05T22:39:02.250Z', id: 'judge', name: 'Test Judge' })
    )

    expect(mockDynamoDB.write).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: '1986-10-05T22:39:02.250Z',
        createdBy: 'Test User',
        id: 'judge',
        modifiedAt: expect.any(String),
        modifiedBy: 'Test User',
        name: 'Test Judge',
      })
    )
  })
})
