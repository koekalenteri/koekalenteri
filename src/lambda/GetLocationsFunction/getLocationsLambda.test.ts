import type { JsonUser } from '../../types'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'

vi.doMock('../lib/api-gw', () => ({
  getOrigin: vi.fn(),
}))

vi.doMock('../lib/auth', () => ({
  authorize: vi.fn(),
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: vi.fn() }
  }),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as import('vitest').Mock<typeof authorize>

const { default: getLocationsHandler, dynamoDB } = await import('./handler')
const mockDynamoDB = dynamoDB as import('vitest').Mocked<typeof dynamoDB>

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: 'user1',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  roles: { org1: 'secretary' },
}

const locations = [{ district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' }]

describe('getLocationsLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)

    const res = await getLocationsHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
    expect(mockDynamoDB.read).not.toHaveBeenCalled()
  })

  it('should return 401 for a user without event editing rights', async () => {
    authorizeMock.mockResolvedValueOnce({ ...mockUser, roles: undefined })

    const res = await getLocationsHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
    expect(mockDynamoDB.read).not.toHaveBeenCalled()
  })

  it('should return the stored locations', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.read.mockResolvedValueOnce({ count: 1, id: 'fi', items: locations, modifiedAt: 'now' })

    const res = await getLocationsHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual(locations)
  })

  it('should return an empty list when nothing is stored yet', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.read.mockResolvedValueOnce(undefined)

    const res = await getLocationsHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual([])
  })
})
