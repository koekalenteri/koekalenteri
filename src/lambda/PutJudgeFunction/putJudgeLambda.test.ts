import type { JsonUser } from '../../types'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

import { constructAPIGwEvent } from '../test-utils/helpers'

vi.doMock('../lib/api-gw', () => ({
  getOrigin: vi.fn(),
}))

const mockAuthorizeAdmin = vi.fn()
vi.doMock('../lib/auth', () => ({ authorizeAdmin: mockAuthorizeAdmin }))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { write: vi.fn() }
  }),
}))

const { default: putJudgeLambda, dynamoDB } = await import('./handler')
const mockDynamoDB = dynamoDB as import('vitest').Mocked<typeof dynamoDB>

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
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    mockAuthorizeAdmin.mockRejectedValueOnce(httpError(401, 'Unauthorized'))
    const res = await putJudgeLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('returns 403 if the authenticated user is not an admin', async () => {
    mockAuthorizeAdmin.mockRejectedValueOnce(httpError(403, 'Forbidden'))

    const res = await putJudgeLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(403)
    expect(mockDynamoDB.write).not.toHaveBeenCalled()
  })

  it('should write the authorized user to database', async () => {
    mockAuthorizeAdmin.mockResolvedValueOnce({ ...mockUser, admin: true })
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
