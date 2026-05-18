import type { JsonUser } from '../../types'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: jest.fn(() => ({})),
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../auth/api', () => ({
  authorize: jest.fn(),
  getAndUpdateUserByEmail: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ readAll: jest.fn() })),
}))

const mockJudgeList = jest.fn<any>()
jest.unstable_mockModule('../judge/repository', () => ({
  judgeRepository: {
    list: mockJudgeList,
  },
}))

const { authorize } = await import('../auth/api')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: getJudgesHandler } = await import('./handler')

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

describe('getJudgesLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getJudgesHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getJudgesHandler(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('should return all non-deleted officials', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockJudgeList.mockResolvedValue([{ deletedAt: 'sometimes' }, { name: 'not deleted' }])

    const res = await getJudgesHandler(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"name":"not deleted"}]"')
  })
})
